-- Aggiunta atomica di una consegna al piano già salvato.
-- La creazione dell'ordine e il collegamento sono la stessa transazione.
-- Il segnale portale dice se la versione pubblicata è stata annullata.

alter table public.approvvigionamenti_operazioni
  drop constraint if exists approvvigionamenti_operazioni_tipo_check;
alter table public.approvvigionamenti_operazioni
  add constraint approvvigionamenti_operazioni_tipo_check
  check (tipo in (
    'crea', 'aggiorna', 'copia', 'settimana', 'piano', 'composizione',
    'pubblica', 'visione', 'carico', 'arrivo', 'pianificazione',
    'annulla', 'collega', 'estendi', 'aggiungi'
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
    'annulla', 'collega', 'estendi', 'aggiungi'
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

create or replace function public.approvvigionamento_aggiungi_consegna_piano(
  p_chiave text,
  p_piano_id uuid,
  p_revisione integer,
  p_data date,
  p_note text,
  p_righe jsonb
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
  v_operazione uuid;
  v_ordine uuid;
  v_codice text;
  v_nuova integer;
  v_riga jsonb;
  v_tipo text;
begin
  if not public.approvvigionamento_autorizzato() then
    raise exception 'Non autorizzato a registrare gli approvvigionamenti';
  end if;
  if p_data is null then
    raise exception 'Data non valida';
  end if;
  if jsonb_typeof(p_righe) <> 'array' or jsonb_array_length(p_righe) = 0 then
    raise exception 'Serve almeno una materia prima.';
  end if;
  for v_riga in select value from jsonb_array_elements(p_righe)
  loop
    v_tipo := coalesce(nullif(v_riga->>'tipoQuantita', ''), '');
    if v_tipo not in ('precisa', 'stimata') then
      raise exception 'Indica se la quantità è precisa o stimata.';
    end if;
  end loop;

  select fornitore_id, periodo_inizio, periodo_fine, revisione, stato, deleted_at
    into v_fornitore, v_inizio, v_fine, v_revisione, v_stato, v_deleted
  from public.approvvigionamenti_piani
  where id = p_piano_id
  for update;

  if v_fornitore is null or v_deleted is not null
     or v_stato not in ('bozza', 'pubblicato', 'da_ripubblicare') then
    raise exception 'Piano non trovato';
  end if;
  if v_revisione is distinct from p_revisione then
    raise exception 'Il piano è stato modificato da un altro salvataggio. Ricarica e riprova.';
  end if;

  perform public.approvvigionamento_valida_righe(v_fornitore, p_righe);

  v_operazione := public.approvvigionamento_acquisisci_operazione(
    p_chiave,
    'aggiungi',
    jsonb_build_object(
      'pianoId', p_piano_id,
      'data', p_data,
      'revisioneAttesa', p_revisione,
      'righe', p_righe
    ),
    p_piano_id
  );
  if v_operazione is null then
    select l.ordine_id, o.codice, p.revisione, p.periodo_inizio, p.periodo_fine
      into v_ordine, v_codice, v_revisione, v_inizio, v_fine
    from public.approvvigionamenti_operazioni_ordini l
    join public.approvvigionamenti_ordini o on o.id = l.ordine_id
    join public.approvvigionamenti_piani p on p.id = p_piano_id
    where l.operazione_id = (
      select id from public.approvvigionamenti_operazioni where chiave = p_chiave
    );
    return jsonb_build_object(
      'riusata', true,
      'ordineId', v_ordine,
      'codice', v_codice,
      'revisione', v_revisione,
      'periodoInizio', v_inizio,
      'periodoFine', v_fine
    );
  end if;

  insert into public.approvvigionamenti_ordini (
    codice, fornitore_id, data_consegna, note, stato, revisione, created_by, updated_by
  )
  values (
    'AP-' || to_char(current_date, 'YY') || '-' || lpad(nextval('public.approvvigionamenti_codice_seq')::text, 4, '0'),
    v_fornitore,
    p_data,
    left(coalesce(p_note, ''), 2000),
    'bozza',
    1,
    public.app_effective_uid(),
    public.app_effective_uid()
  )
  returning id, codice into v_ordine, v_codice;

  insert into public.approvvigionamenti_righe (
    ordine_id, materia_prima_id, quantita, unita_misura, tipo_quantita, note, sort_order,
    created_by, updated_by
  )
  select
    v_ordine,
    (riga->>'materiaPrimaId')::uuid,
    (riga->>'quantita')::numeric,
    riga->>'unitaMisura',
    riga->>'tipoQuantita',
    left(coalesce(riga->>'note', ''), 500),
    ordinality::integer - 1,
    public.app_effective_uid(),
    public.app_effective_uid()
  from jsonb_array_elements(p_righe) with ordinality as t(riga, ordinality);

  insert into public.approvvigionamenti_operazioni_ordini (operazione_id, ordine_id)
  values (v_operazione, v_ordine);

  insert into public.approvvigionamenti_piani_ordini (piano_id, ordine_id, created_by)
  values (p_piano_id, v_ordine, public.app_effective_uid());

  update public.approvvigionamenti_piani
  set periodo_inizio = least(periodo_inizio, p_data),
      periodo_fine = greatest(periodo_fine, p_data),
      revisione = revisione + 1,
      updated_by = public.app_effective_uid(),
      stato = case
        when versione_pubblicata is not null then 'da_ripubblicare'
        else stato
      end
  where id = p_piano_id
    and revisione = p_revisione
  returning revisione, periodo_inizio, periodo_fine
    into v_nuova, v_inizio, v_fine;

  if v_nuova is null then
    raise exception 'Il piano è stato modificato da un altro salvataggio. Ricarica e riprova.';
  end if;
  v_revisione := v_nuova;

  return jsonb_build_object(
    'riusata', false,
    'ordineId', v_ordine,
    'codice', v_codice,
    'revisione', v_revisione,
    'periodoInizio', v_inizio,
    'periodoFine', v_fine
  );
end;
$$;

comment on function public.approvvigionamento_aggiungi_consegna_piano(text, uuid, integer, date, text, jsonb) is
  'Crea una consegna e la collega allo stesso piano. Se il collegamento non riesce, l''ordine non resta.';

drop function if exists public.approvvigionamenti_segnali_portale();

create function public.approvvigionamenti_segnali_portale()
returns table (
  ambito text,
  riferimento_id uuid,
  versione_pubblicata integer,
  bozza_non_pubblicata boolean,
  annullata boolean
)
language sql
stable
security definer
set search_path = public
as $$
  select
    'ordine'::text,
    o.id,
    o.versione_pubblicata,
    o.stato = 'da_ripubblicare',
    o.stato = 'annullato'
  from public.approvvigionamenti_ordini o
  where o.deleted_at is null
    and o.versione_pubblicata is not null
    and (
      public.approvvigionamento_autorizzato()
      or o.fornitore_id = public.fornitore_collegato_id()
    )
  union all
  select
    'piano'::text,
    p.id,
    p.versione_pubblicata,
    p.stato = 'da_ripubblicare',
    false
  from public.approvvigionamenti_piani p
  where p.deleted_at is null
    and p.versione_pubblicata is not null
    and (
      public.approvvigionamento_autorizzato()
      or p.fornitore_id = public.fornitore_collegato_id()
    );
$$;

comment on function public.approvvigionamenti_segnali_portale() is
  'Versione pubblicata, bozza successiva e consegna annullata. Non espone quantità o date della bozza.';

revoke all on function public.approvvigionamento_aggiungi_consegna_piano(text, uuid, integer, date, text, jsonb)
  from public, anon;
revoke all on function public.approvvigionamenti_segnali_portale() from public, anon;
grant execute on function public.approvvigionamento_aggiungi_consegna_piano(text, uuid, integer, date, text, jsonb)
  to authenticated;
grant execute on function public.approvvigionamenti_segnali_portale() to authenticated;
