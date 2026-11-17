-- Pianificazione di consegne sullo stesso ordine, piano e versione già esistenti.
-- L'anteprima non passa da qui. Una bozza non pubblica e non avvisa il fornitore.

alter table public.approvvigionamenti_righe
  add column if not exists tipo_quantita text not null default 'precisa';

alter table public.approvvigionamenti_righe
  drop constraint if exists approvvigionamenti_righe_tipo_quantita_check;
alter table public.approvvigionamenti_righe
  add constraint approvvigionamenti_righe_tipo_quantita_check
  check (tipo_quantita in ('precisa', 'stimata'));

comment on column public.approvvigionamenti_righe.tipo_quantita is
  'precisa: quantità da ordinare. stimata: quantità indicativa, distinta nei riepiloghi.';

alter table public.approvvigionamenti_piani
  add column if not exists cadenza_giorni integer,
  add column if not exists tipo_quantita text not null default 'precisa';

alter table public.approvvigionamenti_piani
  drop constraint if exists approvvigionamenti_piani_cadenza_check;
alter table public.approvvigionamenti_piani
  add constraint approvvigionamenti_piani_cadenza_check
  check (cadenza_giorni is null or cadenza_giorni > 0);

alter table public.approvvigionamenti_piani
  drop constraint if exists approvvigionamenti_piani_tipo_quantita_check;
alter table public.approvvigionamenti_piani
  add constraint approvvigionamenti_piani_tipo_quantita_check
  check (tipo_quantita in ('precisa', 'stimata'));

do $$
declare
  r record;
begin
  for r in
    select con.conname, rel.relname
    from pg_constraint con
    join pg_class rel on rel.oid = con.conrelid
    join pg_namespace nsp on nsp.oid = rel.relnamespace
    where nsp.nspname = 'public'
      and rel.relname in ('approvvigionamenti_piani', 'approvvigionamenti_piani_versioni')
      and con.contype = 'c'
      and pg_get_constraintdef(con.oid) ilike '%tipologia%'
  loop
    execute format('alter table public.%I drop constraint %I', r.relname, r.conname);
  end loop;
end $$;

alter table public.approvvigionamenti_piani
  add constraint approvvigionamenti_piani_tipologia_check
  check (tipologia in ('settimanale', 'mensile', 'regolare', 'personalizzata'));

alter table public.approvvigionamenti_piani_versioni
  add constraint approvvigionamenti_piani_versioni_tipologia_check
  check (tipologia in ('settimanale', 'mensile', 'regolare', 'personalizzata'));

comment on column public.approvvigionamenti_piani.cadenza_giorni is
  'Ogni quanti giorni, solo per la tipologia regolare. Le date personalizzate restano vuote.';

alter table public.approvvigionamenti_operazioni
  drop constraint if exists approvvigionamenti_operazioni_tipo_check;
alter table public.approvvigionamenti_operazioni
  add constraint approvvigionamenti_operazioni_tipo_check
  check (tipo in (
    'crea', 'aggiorna', 'copia', 'settimana', 'piano', 'composizione',
    'pubblica', 'visione', 'carico', 'arrivo', 'pianificazione'
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
    'pubblica', 'visione', 'carico', 'arrivo', 'pianificazione'
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

create or replace function public.registra_approvvigionamenti(
  p_chiave text,
  p_tipo text,
  p_ordini jsonb
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_operazione uuid;
  v_ordine jsonb;
  v_riga jsonb;
  v_ordine_id uuid;
  v_fornitore uuid;
  v_ids uuid[] := array[]::uuid[];
  v_piani jsonb;
  v_elenco jsonb;
  v_meta jsonb;
  v_tipologia text;
  v_cadenza integer;
  v_tipo_quantita text;
  v_inizio date;
  v_fine date;
  v_piano uuid;
  v_codice text;
  v_tipo_riga text;
begin
  if not public.approvvigionamento_autorizzato() then
    raise exception 'Non autorizzato a registrare gli approvvigionamenti';
  end if;
  if p_tipo not in ('crea', 'copia', 'settimana', 'piano', 'pianificazione') then
    raise exception 'Tipo operazione non valido';
  end if;
  if jsonb_typeof(p_ordini) <> 'array' or jsonb_array_length(p_ordini) = 0 then
    raise exception 'Nessun ordine da registrare';
  end if;
  if jsonb_array_length(p_ordini) > 200 then
    raise exception 'La pianificazione supera 200 consegne.';
  end if;

  v_meta := coalesce(p_ordini->0->'pianificazione', '{}'::jsonb);
  v_tipologia := v_meta->>'tipologia';
  v_cadenza := nullif(v_meta->>'cadenzaGiorni', '')::integer;
  v_tipo_quantita := coalesce(nullif(v_meta->>'tipoQuantita', ''), 'precisa');
  v_inizio := nullif(v_meta->>'periodoInizio', '')::date;
  v_fine := nullif(v_meta->>'periodoFine', '')::date;
  if p_tipo = 'pianificazione' then
    if v_tipologia not in ('regolare', 'personalizzata') then
      raise exception 'Tipo di pianificazione non valido';
    end if;
    if v_tipo_quantita not in ('precisa', 'stimata') then
      raise exception 'Tipo quantità non valido';
    end if;
    if v_inizio is null or v_fine is null or v_fine < v_inizio then
      raise exception 'Periodo di pianificazione non valido';
    end if;
    if v_tipologia = 'regolare' and (v_cadenza is null or v_cadenza < 1) then
      raise exception 'Indica ogni quanti giorni ripetere la consegna.';
    end if;
    if v_tipologia = 'personalizzata' then
      v_cadenza := null;
    end if;
  end if;

  for v_ordine in select value from jsonb_array_elements(p_ordini)
  loop
    if p_tipo = 'pianificazione'
       and (
         (v_ordine->>'dataConsegna')::date < v_inizio
         or (v_ordine->>'dataConsegna')::date > v_fine
       )
    then
      raise exception 'Una consegna esce dal periodo della pianificazione.';
    end if;
    for v_riga in select value from jsonb_array_elements(v_ordine->'righe')
    loop
      v_tipo_riga := coalesce(nullif(v_riga->>'tipoQuantita', ''), 'precisa');
      if v_tipo_riga not in ('precisa', 'stimata') then
        raise exception 'Tipo quantità non valido';
      end if;
    end loop;
    perform public.approvvigionamento_valida_righe(
      (v_ordine->>'fornitoreId')::uuid,
      v_ordine->'righe'
    );
  end loop;

  v_operazione := public.approvvigionamento_acquisisci_operazione(
    p_chiave, p_tipo, p_ordini, null
  );
  if v_operazione is null then
    select id into v_operazione
    from public.approvvigionamenti_operazioni
    where chiave = p_chiave;
    select coalesce(jsonb_agg(jsonb_build_object(
      'id', o.id,
      'codice', o.codice,
      'dataConsegna', o.data_consegna
    ) order by o.data_consegna, o.codice), '[]'::jsonb)
      into v_elenco
    from public.approvvigionamenti_operazioni_ordini l
    join public.approvvigionamenti_ordini o on o.id = l.ordine_id
    where l.operazione_id = v_operazione
      and o.deleted_at is null;
    select coalesce(jsonb_agg(jsonb_build_object(
      'id', p.id,
      'codice', p.codice,
      'fornitoreId', p.fornitore_id,
      'tipologia', p.tipologia,
      'periodoInizio', p.periodo_inizio,
      'periodoFine', p.periodo_fine
    ) order by p.codice), '[]'::jsonb)
      into v_piani
    from public.approvvigionamenti_piani p
    where p.deleted_at is null
      and exists (
        select 1
        from public.approvvigionamenti_piani_ordini po
        join public.approvvigionamenti_operazioni_ordini l on l.ordine_id = po.ordine_id
        where po.piano_id = p.id
          and l.operazione_id = v_operazione
      );
    return jsonb_build_object('riusata', true, 'ordini', v_elenco, 'piani', v_piani);
  end if;

  for v_ordine in select value from jsonb_array_elements(p_ordini)
  loop
    v_fornitore := (v_ordine->>'fornitoreId')::uuid;
    insert into public.approvvigionamenti_ordini (
      codice, fornitore_id, data_consegna, note, stato, origine_ordine_id,
      revisione, created_by, updated_by
    )
    values (
      'AP-' || to_char(current_date, 'YY') || '-' || lpad(nextval('public.approvvigionamenti_codice_seq')::text, 4, '0'),
      v_fornitore,
      (v_ordine->>'dataConsegna')::date,
      left(coalesce(v_ordine->>'note', ''), 2000),
      'bozza',
      nullif(v_ordine->>'origineOrdineId', '')::uuid,
      1,
      public.app_effective_uid(),
      public.app_effective_uid()
    )
    returning id into v_ordine_id;

    insert into public.approvvigionamenti_righe (
      ordine_id, materia_prima_id, quantita, unita_misura, tipo_quantita, note, sort_order,
      created_by, updated_by
    )
    select
      v_ordine_id,
      (riga->>'materiaPrimaId')::uuid,
      (riga->>'quantita')::numeric,
      riga->>'unitaMisura',
      coalesce(nullif(riga->>'tipoQuantita', ''), 'precisa'),
      left(coalesce(riga->>'note', ''), 500),
      ordinality::integer - 1,
      public.app_effective_uid(),
      public.app_effective_uid()
    from jsonb_array_elements(v_ordine->'righe') with ordinality as t(riga, ordinality);

    insert into public.approvvigionamenti_operazioni_ordini (operazione_id, ordine_id)
    values (v_operazione, v_ordine_id);
    v_ids := array_append(v_ids, v_ordine_id);
  end loop;

  if p_tipo = 'pianificazione' then
    v_piani := '[]'::jsonb;
    for v_fornitore in
      select distinct o.fornitore_id
      from public.approvvigionamenti_ordini o
      where o.id = any(v_ids)
    loop
      v_codice := 'PP-' || to_char(current_date, 'YY') || '-'
        || lpad(nextval('public.approvvigionamenti_piani_codice_seq')::text, 4, '0');
      insert into public.approvvigionamenti_piani (
        codice, fornitore_id, periodo_inizio, periodo_fine, tipologia, cadenza_giorni,
        tipo_quantita, stato, created_by, updated_by
      )
      values (
        v_codice, v_fornitore, v_inizio, v_fine, v_tipologia, v_cadenza,
        v_tipo_quantita, 'bozza',
        public.app_effective_uid(), public.app_effective_uid()
      )
      returning id into v_piano;
      insert into public.approvvigionamenti_piani_ordini (piano_id, ordine_id, created_by)
      select v_piano, o.id, public.app_effective_uid()
      from public.approvvigionamenti_ordini o
      where o.id = any(v_ids)
        and o.fornitore_id = v_fornitore;
      v_piani := v_piani || jsonb_build_array(jsonb_build_object(
        'id', v_piano,
        'codice', v_codice,
        'fornitoreId', v_fornitore,
        'tipologia', v_tipologia,
        'periodoInizio', v_inizio,
        'periodoFine', v_fine
      ));
    end loop;
  else
    v_piani := public.approvvigionamento_crea_piani(p_tipo, v_ids);
  end if;

  select coalesce(jsonb_agg(jsonb_build_object(
    'id', o.id,
    'codice', o.codice,
    'dataConsegna', o.data_consegna
  ) order by o.data_consegna, o.codice), '[]'::jsonb)
    into v_elenco
  from public.approvvigionamenti_ordini o
  where o.id = any(v_ids);
  return jsonb_build_object('riusata', false, 'ordini', v_elenco, 'piani', v_piani);
end;
$$;

create or replace function public.aggiorna_approvvigionamento(
  p_chiave text,
  p_ordine_id uuid,
  p_ordine jsonb,
  p_revisione integer
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_operazione uuid;
  v_fornitore uuid;
  v_aggiornato uuid;
  v_revisione integer;
  v_piano uuid;
  v_riga jsonb;
  v_tipo_riga text;
begin
  if not public.approvvigionamento_autorizzato() then
    raise exception 'Non autorizzato a registrare gli approvvigionamenti';
  end if;
  if p_revisione is null or p_revisione <= 0 then
    raise exception 'Revisione della bozza mancante';
  end if;

  v_piano := public.approvvigionamento_blocca_ordine(p_ordine_id);

  for v_riga in select value from jsonb_array_elements(coalesce(p_ordine->'righe', '[]'::jsonb))
  loop
    v_tipo_riga := coalesce(nullif(v_riga->>'tipoQuantita', ''), 'precisa');
    if v_tipo_riga not in ('precisa', 'stimata') then
      raise exception 'Tipo quantità non valido';
    end if;
  end loop;

  v_operazione := public.approvvigionamento_acquisisci_operazione(
    p_chiave,
    'aggiorna',
    p_ordine || jsonb_build_object('revisioneAttesa', p_revisione),
    p_ordine_id
  );
  if v_operazione is null then
    select revisione into v_revisione
    from public.approvvigionamenti_ordini
    where id = p_ordine_id;
    return jsonb_build_object('riusata', true, 'id', p_ordine_id, 'revisione', v_revisione);
  end if;

  v_fornitore := (p_ordine->>'fornitoreId')::uuid;
  perform public.approvvigionamento_valida_righe(v_fornitore, p_ordine->'righe');
  if exists (
    select 1
    from public.approvvigionamenti_piani_ordini po
    join public.approvvigionamenti_piani p on p.id = po.piano_id
    where po.ordine_id = p_ordine_id
      and p.deleted_at is null
      and (
        p.fornitore_id <> v_fornitore
        or (p_ordine->>'dataConsegna')::date < p.periodo_inizio
        or (p_ordine->>'dataConsegna')::date > p.periodo_fine
      )
  ) then
    raise exception 'L''ordine resta nel periodo e nel fornitore del suo piano.';
  end if;

  update public.approvvigionamenti_ordini
  set fornitore_id = v_fornitore,
      data_consegna = (p_ordine->>'dataConsegna')::date,
      note = left(coalesce(p_ordine->>'note', ''), 2000),
      updated_by = public.app_effective_uid(),
      revisione = revisione + 1,
      stato = case
        when versione_pubblicata is not null then 'da_ripubblicare'
        else stato
      end
  where id = p_ordine_id
    and deleted_at is null
    and stato in ('bozza', 'pubblicato', 'da_ripubblicare')
    and revisione = p_revisione
    and presa_visione_at is null
    and foglio_ingresso_id is null
  returning id, revisione into v_aggiornato, v_revisione;

  if v_aggiornato is null then
    if exists (
      select 1 from public.approvvigionamenti_ordini
      where id = p_ordine_id
        and deleted_at is null
        and stato in ('bozza', 'pubblicato', 'da_ripubblicare')
    ) then
      raise exception 'La bozza è stata modificata da un altro salvataggio. Ricarica e riprova.';
    end if;
    raise exception 'Ordine non trovato';
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
      and deleted_at is null;
  end if;

  update public.approvvigionamenti_righe
  set deleted_at = now(),
      deleted_by = public.app_effective_uid()
  where ordine_id = p_ordine_id
    and deleted_at is null;

  insert into public.approvvigionamenti_righe (
    ordine_id, materia_prima_id, quantita, unita_misura, tipo_quantita, note, sort_order,
    created_by, updated_by
  )
  select
    p_ordine_id,
    (riga->>'materiaPrimaId')::uuid,
    (riga->>'quantita')::numeric,
    riga->>'unitaMisura',
    coalesce(nullif(riga->>'tipoQuantita', ''), 'precisa'),
    left(coalesce(riga->>'note', ''), 500),
    ordinality::integer - 1,
    public.app_effective_uid(),
    public.app_effective_uid()
  from jsonb_array_elements(p_ordine->'righe') with ordinality as t(riga, ordinality);

  insert into public.approvvigionamenti_operazioni_ordini (operazione_id, ordine_id)
  values (v_operazione, p_ordine_id);

  return jsonb_build_object('riusata', false, 'id', p_ordine_id, 'revisione', v_revisione);
end;
$$;

create or replace function public.approvvigionamenti_versioni_tipo_quantita()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  select coalesce(jsonb_agg(arricchito order by ordine), '[]'::jsonb)
    into new.righe
  from (
    select
      elem || jsonb_build_object(
        'tipoQuantita',
        coalesce(
          (
            select r.tipo_quantita
            from public.approvvigionamenti_righe r
            where r.ordine_id = new.ordine_id
              and r.deleted_at is null
              and r.materia_prima_id = (elem->>'materiaPrimaId')::uuid
            order by r.sort_order
            limit 1
          ),
          coalesce(elem->>'tipoQuantita', 'precisa')
        )
      ) as arricchito,
      ordinality as ordine
    from jsonb_array_elements(new.righe) with ordinality as t(elem, ordinality)
  ) voci;
  return new;
end;
$$;

drop trigger if exists approvvigionamenti_versioni_tipo_quantita
  on public.approvvigionamenti_versioni;
create trigger approvvigionamenti_versioni_tipo_quantita
  before insert on public.approvvigionamenti_versioni
  for each row execute function public.approvvigionamenti_versioni_tipo_quantita();

comment on function public.approvvigionamenti_versioni_tipo_quantita() is
  'Lo snapshot pubblicato conserva se la quantità era precisa o stimata. Non pubblica da solo.';
