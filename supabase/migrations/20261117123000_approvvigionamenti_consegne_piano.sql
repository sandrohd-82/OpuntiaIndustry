-- Consegne della stessa pianificazione: si aggiungono, si spostano e si annullano
-- senza creare un secondo piano e senza cancellare le versioni pubblicate.

alter table public.approvvigionamenti_ordini
  drop constraint if exists approvvigionamenti_ordini_stato_check;
alter table public.approvvigionamenti_ordini
  add constraint approvvigionamenti_ordini_stato_check
  check (stato in ('bozza', 'pubblicato', 'da_ripubblicare', 'annullato'));

alter table public.approvvigionamenti_operazioni
  drop constraint if exists approvvigionamenti_operazioni_tipo_check;
alter table public.approvvigionamenti_operazioni
  add constraint approvvigionamenti_operazioni_tipo_check
  check (tipo in (
    'crea', 'aggiorna', 'copia', 'settimana', 'piano', 'composizione',
    'pubblica', 'visione', 'carico', 'arrivo', 'pianificazione',
    'annulla', 'collega', 'estendi'
  ));

create or replace function public.approvvigionamento_acquisisci_operazione(
  p_chiave text,
  p_tipo text,
  p_impronta jsonb,
  p_riferimento uuid
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_id uuid;
  v_tipo text;
  v_impronta jsonb;
  v_riferimento uuid;
begin
  if p_chiave is null or length(btrim(p_chiave)) < 8 then
    raise exception 'Chiave operazione non valida';
  end if;
  if p_tipo not in (
    'crea', 'copia', 'settimana', 'piano', 'aggiorna', 'composizione',
    'pubblica', 'visione', 'carico', 'arrivo', 'pianificazione',
    'annulla', 'collega', 'estendi'
  ) then
    raise exception 'Tipo operazione non valido';
  end if;

  insert into public.approvvigionamenti_operazioni (
    chiave, tipo, impronta, riferimento_id, created_by
  )
  values (p_chiave, p_tipo, p_impronta, p_riferimento, public.app_effective_uid())
  on conflict (chiave) do nothing
  returning id into v_id;

  if v_id is not null then
    return v_id;
  end if;

  select tipo, impronta, riferimento_id
    into v_tipo, v_impronta, v_riferimento
  from public.approvvigionamenti_operazioni
  where chiave = p_chiave;

  if v_tipo is distinct from p_tipo
     or v_impronta is distinct from p_impronta
     or v_riferimento is distinct from p_riferimento
  then
    raise exception 'La chiave è già stata usata per un''altra operazione.';
  end if;
  return null;
end;
$$;

create or replace function public.approvvigionamento_estendi_periodo_piano(
  p_chiave text,
  p_piano_id uuid,
  p_revisione integer,
  p_data date
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_inizio date;
  v_fine date;
  v_revisione integer;
  v_stato text;
  v_deleted timestamptz;
  v_pubblicata integer;
  v_nuovo_inizio date;
  v_nuovo_fine date;
  v_operazione uuid;
begin
  if not public.approvvigionamento_autorizzato() then
    raise exception 'Non autorizzato a registrare gli approvvigionamenti';
  end if;
  if p_data is null then
    raise exception 'Data non valida';
  end if;

  select periodo_inizio, periodo_fine, revisione, stato, deleted_at, versione_pubblicata
    into v_inizio, v_fine, v_revisione, v_stato, v_deleted, v_pubblicata
  from public.approvvigionamenti_piani
  where id = p_piano_id
  for update;

  if v_inizio is null or v_deleted is not null
     or v_stato not in ('bozza', 'pubblicato', 'da_ripubblicare') then
    raise exception 'Piano non trovato';
  end if;
  if p_data between v_inizio and v_fine then
    return jsonb_build_object('riusata', true, 'esteso', false, 'revisione', v_revisione);
  end if;
  if v_revisione is distinct from p_revisione then
    raise exception 'Il piano è stato modificato da un altro salvataggio. Ricarica e riprova.';
  end if;

  v_nuovo_inizio := least(v_inizio, p_data);
  v_nuovo_fine := greatest(v_fine, p_data);
  v_operazione := public.approvvigionamento_acquisisci_operazione(
    p_chiave,
    'estendi',
    jsonb_build_object('pianoId', p_piano_id, 'data', p_data, 'revisioneAttesa', p_revisione),
    p_piano_id
  );
  if v_operazione is null then
    select revisione into v_revisione
    from public.approvvigionamenti_piani
    where id = p_piano_id;
    return jsonb_build_object('riusata', true, 'esteso', true, 'revisione', v_revisione);
  end if;

  update public.approvvigionamenti_piani
  set periodo_inizio = v_nuovo_inizio,
      periodo_fine = v_nuovo_fine,
      revisione = revisione + 1,
      updated_by = public.app_effective_uid(),
      stato = case
        when versione_pubblicata is not null then 'da_ripubblicare'
        else stato
      end
  where id = p_piano_id
    and revisione = p_revisione
  returning revisione into v_revisione;

  return jsonb_build_object(
    'riusata', false,
    'esteso', true,
    'revisione', v_revisione,
    'periodoInizio', v_nuovo_inizio,
    'periodoFine', v_nuovo_fine
  );
end;
$$;

create or replace function public.approvvigionamento_collega_consegna(
  p_chiave text,
  p_piano_id uuid,
  p_ordine_id uuid,
  p_revisione integer
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_fornitore uuid;
  v_inizio date;
  v_fine date;
  v_revisione integer;
  v_stato text;
  v_deleted timestamptz;
  v_ordine_fornitore uuid;
  v_data date;
  v_ordine_stato text;
  v_ordine_deleted timestamptz;
  v_operazione uuid;
  v_nuovo_inizio date;
  v_nuovo_fine date;
begin
  if not public.approvvigionamento_autorizzato() then
    raise exception 'Non autorizzato a registrare gli approvvigionamenti';
  end if;

  select periodo_inizio, periodo_fine, revisione, stato, deleted_at, fornitore_id
    into v_inizio, v_fine, v_revisione, v_stato, v_deleted, v_fornitore
  from public.approvvigionamenti_piani
  where id = p_piano_id
  for update;

  select fornitore_id, data_consegna, stato, deleted_at
    into v_ordine_fornitore, v_data, v_ordine_stato, v_ordine_deleted
  from public.approvvigionamenti_ordini
  where id = p_ordine_id
  for update;

  if v_fornitore is null or v_deleted is not null
     or v_stato not in ('bozza', 'pubblicato', 'da_ripubblicare') then
    raise exception 'Piano non trovato';
  end if;
  if v_ordine_fornitore is null or v_ordine_deleted is not null
     or v_ordine_stato not in ('bozza', 'pubblicato', 'da_ripubblicare') then
    raise exception 'Consegna non trovata';
  end if;
  if v_ordine_fornitore is distinct from v_fornitore then
    raise exception 'La consegna resta dello stesso fornitore del piano.';
  end if;
  if exists (
    select 1
    from public.approvvigionamenti_piani_ordini l
    where l.ordine_id = p_ordine_id
      and l.piano_id <> p_piano_id
  ) then
    raise exception 'La consegna appartiene già a un altro piano.';
  end if;
  if exists (
    select 1
    from public.approvvigionamenti_piani_ordini l
    where l.ordine_id = p_ordine_id
      and l.piano_id = p_piano_id
  ) and v_data between v_inizio and v_fine then
    return jsonb_build_object(
      'riusata', true,
      'revisione', v_revisione,
      'periodoInizio', v_inizio,
      'periodoFine', v_fine
    );
  end if;
  if v_revisione is distinct from p_revisione then
    raise exception 'Il piano è stato modificato da un altro salvataggio. Ricarica e riprova.';
  end if;

  v_operazione := public.approvvigionamento_acquisisci_operazione(
    p_chiave,
    'collega',
    jsonb_build_object(
      'pianoId', p_piano_id,
      'ordineId', p_ordine_id,
      'revisioneAttesa', p_revisione
    ),
    p_piano_id
  );
  if v_operazione is null then
    select revisione, periodo_inizio, periodo_fine
      into v_revisione, v_nuovo_inizio, v_nuovo_fine
    from public.approvvigionamenti_piani
    where id = p_piano_id;
    return jsonb_build_object(
      'riusata', true,
      'revisione', v_revisione,
      'periodoInizio', v_nuovo_inizio,
      'periodoFine', v_nuovo_fine
    );
  end if;

  v_nuovo_inizio := least(v_inizio, v_data);
  v_nuovo_fine := greatest(v_fine, v_data);
  insert into public.approvvigionamenti_piani_ordini (piano_id, ordine_id, created_by)
  select p_piano_id, p_ordine_id, public.app_effective_uid()
  where not exists (
    select 1
    from public.approvvigionamenti_piani_ordini l
    where l.piano_id = p_piano_id
      and l.ordine_id = p_ordine_id
  );

  update public.approvvigionamenti_piani
  set periodo_inizio = v_nuovo_inizio,
      periodo_fine = v_nuovo_fine,
      revisione = revisione + 1,
      updated_by = public.app_effective_uid(),
      stato = case
        when versione_pubblicata is not null then 'da_ripubblicare'
        else stato
      end
  where id = p_piano_id
    and revisione = p_revisione
  returning revisione into v_revisione;

  return jsonb_build_object(
    'riusata', false,
    'revisione', v_revisione,
    'periodoInizio', v_nuovo_inizio,
    'periodoFine', v_nuovo_fine
  );
end;
$$;

create or replace function public.approvvigionamento_annulla_consegna(
  p_chiave text,
  p_ordine_id uuid,
  p_revisione integer
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_stato text;
  v_revisione integer;
  v_deleted timestamptz;
  v_pubblicata integer;
  v_piano uuid;
  v_operazione uuid;
  v_carichi integer;
begin
  if not public.approvvigionamento_autorizzato() then
    raise exception 'Non autorizzato a registrare gli approvvigionamenti';
  end if;

  select stato, revisione, deleted_at, versione_pubblicata
    into v_stato, v_revisione, v_deleted, v_pubblicata
  from public.approvvigionamenti_ordini
  where id = p_ordine_id
  for update;

  if v_deleted is not null then
    raise exception 'Consegna non trovata';
  end if;
  if v_stato = 'annullato' then
    return jsonb_build_object('riusata', true, 'stato', 'annullato');
  end if;
  if v_stato not in ('bozza', 'pubblicato', 'da_ripubblicare') then
    raise exception 'Consegna non trovata';
  end if;
  if v_revisione is distinct from p_revisione then
    raise exception 'La consegna è stata modificata da un altro salvataggio. Ricarica e riprova.';
  end if;

  select count(*) into v_carichi
  from public.approvvigionamenti_carichi
  where ordine_id = p_ordine_id
    and deleted_at is null;
  if v_carichi > 0 then
    raise exception 'La consegna ha già un carico. Non si annulla.';
  end if;

  select piano_id into v_piano
  from public.approvvigionamenti_piani_ordini
  where ordine_id = p_ordine_id
  limit 1;

  v_operazione := public.approvvigionamento_acquisisci_operazione(
    p_chiave,
    'annulla',
    jsonb_build_object('ordineId', p_ordine_id, 'revisioneAttesa', p_revisione),
    p_ordine_id
  );
  if v_operazione is null then
    select stato into v_stato
    from public.approvvigionamenti_ordini
    where id = p_ordine_id;
    return jsonb_build_object('riusata', true, 'stato', coalesce(v_stato, 'annullato'));
  end if;

  if v_pubblicata is null and v_stato = 'bozza' then
    update public.approvvigionamenti_righe
    set deleted_at = now(),
        deleted_by = public.app_effective_uid()
    where ordine_id = p_ordine_id
      and deleted_at is null;
    update public.approvvigionamenti_ordini
    set deleted_at = now(),
        deleted_by = public.app_effective_uid(),
        updated_by = public.app_effective_uid()
    where id = p_ordine_id;
    delete from public.approvvigionamenti_piani_ordini
    where ordine_id = p_ordine_id;
  else
    update public.approvvigionamenti_ordini
    set stato = 'annullato',
        revisione = revisione + 1,
        updated_by = public.app_effective_uid()
    where id = p_ordine_id
      and revisione = p_revisione;
    delete from public.approvvigionamenti_piani_ordini
    where ordine_id = p_ordine_id;
  end if;

  if v_piano is not null then
    update public.approvvigionamenti_piani
    set revisione = revisione + 1,
        updated_by = public.app_effective_uid(),
        stato = case
          when versione_pubblicata is not null then 'da_ripubblicare'
          else stato
        end
    where id = v_piano
      and deleted_at is null
      and stato in ('bozza', 'pubblicato', 'da_ripubblicare');
  end if;

  return jsonb_build_object(
    'riusata', false,
    'stato', case when v_pubblicata is null and v_stato = 'bozza' then 'bozza' else 'annullato' end
  );
end;
$$;

comment on function public.approvvigionamento_annulla_consegna(text, uuid, integer) is
  'Annulla una consegna. Non cancella approvvigionamenti_versioni e non pubblica.';

revoke all on function public.approvvigionamento_estendi_periodo_piano(text, uuid, integer, date)
  from public, anon;
revoke all on function public.approvvigionamento_collega_consegna(text, uuid, uuid, integer)
  from public, anon;
revoke all on function public.approvvigionamento_annulla_consegna(text, uuid, integer)
  from public, anon;
grant execute on function public.approvvigionamento_estendi_periodo_piano(text, uuid, integer, date)
  to authenticated;
grant execute on function public.approvvigionamento_collega_consegna(text, uuid, uuid, integer)
  to authenticated;
grant execute on function public.approvvigionamento_annulla_consegna(text, uuid, integer)
  to authenticated;
