-- Arrivo parziale, versione corrente e bilancio per versione.
-- Non riscrive gli snapshot e non sposta i carichi già collegati.

alter table public.approvvigionamenti_carichi
  add column if not exists eccezione_motivazione text;

alter table public.approvvigionamenti_carichi
  drop constraint if exists approvvigionamenti_carichi_stato_check;
alter table public.approvvigionamenti_carichi
  add constraint approvvigionamenti_carichi_stato_check
  check (stato in ('aperto', 'parziale', 'arrivato'));

comment on column public.approvvigionamenti_carichi.eccezione_motivazione is
  'Presente solo se il carico è stato aperto sulla versione superata, con motivazione tracciata.';

create or replace function public.approvvigionamenti_carichi_proteggi()
returns trigger
language plpgsql
as $$
begin
  if tg_op = 'DELETE' then
    raise exception 'Un carico non si elimina';
  end if;
  if new.fornitore_id is distinct from old.fornitore_id
     or new.ordine_id is distinct from old.ordine_id
     or new.versione_id is distinct from old.versione_id
     or new.chiave is distinct from old.chiave
     or new.codice is distinct from old.codice
     or new.created_by is distinct from old.created_by
     or new.eccezione_motivazione is distinct from old.eccezione_motivazione
  then
    raise exception 'Il collegamento del carico non si modifica';
  end if;
  if old.foglio_id is not null and new.foglio_id is distinct from old.foglio_id then
    raise exception 'Il foglio del carico non si sostituisce';
  end if;
  return new;
end;
$$;

create or replace function public.approvvigionamento_crea_carico_interno(
  p_chiave text,
  p_versione_id uuid,
  p_data_prevista date,
  p_righe jsonb,
  p_eccezione boolean,
  p_motivazione text
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_operazione uuid;
  v_ordine uuid;
  v_fornitore uuid;
  v_fornitore_ordine uuid;
  v_numero integer;
  v_pubblicata integer;
  v_snapshot jsonb;
  v_carico uuid;
  v_codice text;
  v_foglio uuid;
  v_foglio_codice text;
  v_riga jsonb;
  v_materia uuid;
  v_qty numeric;
  v_unita text;
  v_trovata jsonb;
  v_viste integer := 0;
  v_motivo text;
begin
  if not public.approvvigionamento_carico_autorizzato() then
    raise exception 'Non autorizzato a creare un carico';
  end if;
  if p_data_prevista is null then
    raise exception 'Data prevista mancante';
  end if;
  if p_righe is null or jsonb_typeof(p_righe) <> 'array' or jsonb_array_length(p_righe) = 0 then
    raise exception 'Il carico deve indicare almeno una materia';
  end if;

  v_motivo := nullif(btrim(coalesce(p_motivazione, '')), '');
  if not coalesce(p_eccezione, false) then
    v_motivo := null;
  elsif v_motivo is null or length(v_motivo) < 10 then
    raise exception 'La versione superata richiede una motivazione';
  end if;

  v_operazione := public.approvvigionamento_acquisisci_operazione(
    p_chiave,
    'carico',
    jsonb_build_object(
      'versioneId', p_versione_id,
      'dataPrevista', p_data_prevista,
      'righe', p_righe,
      'eccezione', coalesce(p_eccezione, false),
      'motivazione', v_motivo
    ),
    p_versione_id
  );
  if v_operazione is null then
    select c.id, c.codice, c.foglio_id, g.codice
      into v_carico, v_codice, v_foglio, v_foglio_codice
    from public.approvvigionamenti_carichi c
    left join public.haccp_fogli_ingresso g on g.id = c.foglio_id
    where c.chiave = p_chiave
      and c.deleted_at is null;
    if v_carico is null or v_foglio is null then
      raise exception 'Operazione non disponibile';
    end if;
    return jsonb_build_object(
      'id', v_carico,
      'codice', v_codice,
      'foglioId', v_foglio,
      'foglioCodice', v_foglio_codice,
      'riusata', true
    );
  end if;

  select ordine_id, fornitore_id, numero, righe
    into v_ordine, v_fornitore, v_numero, v_snapshot
  from public.approvvigionamenti_versioni
  where id = p_versione_id
  for update;

  if v_ordine is null then
    raise exception 'Versione non disponibile';
  end if;

  select fornitore_id, versione_pubblicata
    into v_fornitore_ordine, v_pubblicata
  from public.approvvigionamenti_ordini
  where id = v_ordine
    and deleted_at is null
  for update;

  if v_fornitore_ordine is null or v_fornitore_ordine is distinct from v_fornitore then
    raise exception 'Fornitore, ordine e versione non coincidono';
  end if;

  if coalesce(p_eccezione, false) then
    if v_numero is not distinct from v_pubblicata then
      raise exception 'La versione corrente non usa la procedura eccezionale';
    end if;
  elsif v_numero is distinct from v_pubblicata then
    raise exception 'Si può aprire un carico solo sulla versione pubblicata corrente';
  end if;

  for v_riga in select value from jsonb_array_elements(p_righe) loop
    v_materia := (v_riga->>'materiaPrimaId')::uuid;
    v_qty := (v_riga->>'quantita')::numeric;
    v_unita := v_riga->>'unitaMisura';
    if v_qty is null or v_qty <= 0 then
      raise exception 'Quantità prevista non valida';
    end if;
    select elemento into v_trovata
    from jsonb_array_elements(v_snapshot) elemento
    where elemento->>'materiaPrimaId' = v_materia::text
    limit 1;
    if v_trovata is null then
      raise exception 'La materia non è nello snapshot pubblicato';
    end if;
    if v_trovata->>'unitaMisura' is distinct from v_unita then
      raise exception 'L''unità non coincide con lo snapshot';
    end if;
    if (
      select count(*)
      from jsonb_array_elements(p_righe) altra
      where altra->>'materiaPrimaId' = v_materia::text
    ) > 1 then
      raise exception 'La stessa materia compare due volte nel carico';
    end if;
    v_viste := v_viste + 1;
  end loop;

  v_codice := 'CA-'
    || to_char(now() at time zone 'Europe/Rome', 'YY')
    || '-'
    || lpad(nextval('public.approvvigionamenti_carichi_seq')::text, 4, '0');

  insert into public.approvvigionamenti_carichi (
    codice, fornitore_id, ordine_id, versione_id, data_prevista, stato, chiave,
    eccezione_motivazione, created_by, updated_by
  )
  values (
    v_codice, v_fornitore, v_ordine, p_versione_id, p_data_prevista, 'aperto', p_chiave,
    v_motivo, public.app_effective_uid(), public.app_effective_uid()
  )
  returning id into v_carico;

  insert into public.approvvigionamenti_carichi_righe (
    carico_id, materia_prima_id, codice, nome, unita_misura, quantita_prevista,
    created_by, updated_by
  )
  select
    v_carico,
    (riga->>'materiaPrimaId')::uuid,
    snapshot.elemento->>'codice',
    snapshot.elemento->>'nome',
    snapshot.elemento->>'unitaMisura',
    (riga->>'quantita')::numeric,
    public.app_effective_uid(),
    public.app_effective_uid()
  from jsonb_array_elements(p_righe) riga
  join lateral (
    select elemento
    from jsonb_array_elements(v_snapshot) elemento
    where elemento->>'materiaPrimaId' = riga->>'materiaPrimaId'
    limit 1
  ) snapshot on true;

  v_foglio_codice := public.codice_foglio_ingresso();
  insert into public.haccp_fogli_ingresso (
    codice, fornitore_id, stato, opened_by, created_by, updated_by
  )
  values (
    v_foglio_codice, v_fornitore, 'aperto',
    public.app_effective_uid(), public.app_effective_uid(), public.app_effective_uid()
  )
  returning id into v_foglio;

  update public.approvvigionamenti_carichi
  set foglio_id = v_foglio, updated_by = public.app_effective_uid()
  where id = v_carico and foglio_id is null;

  insert into public.approvvigionamenti_carichi_eventi (carico_id, tipo, payload, created_by)
  values (
    v_carico,
    'creato',
    jsonb_build_object(
      'versioneId', p_versione_id,
      'foglioId', v_foglio,
      'righe', v_viste,
      'eccezione', v_motivo is not null,
      'motivazione', v_motivo
    ),
    public.app_effective_uid()
  );

  return jsonb_build_object(
    'id', v_carico,
    'codice', v_codice,
    'foglioId', v_foglio,
    'foglioCodice', v_foglio_codice,
    'riusata', false
  );
end;
$$;

create or replace function public.crea_carico_approvvigionamento(
  p_chiave text,
  p_versione_id uuid,
  p_data_prevista date,
  p_righe jsonb
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
begin
  return public.approvvigionamento_crea_carico_interno(
    p_chiave, p_versione_id, p_data_prevista, p_righe, false, null
  );
end;
$$;

create or replace function public.crea_carico_versione_storica(
  p_chiave text,
  p_versione_id uuid,
  p_data_prevista date,
  p_righe jsonb,
  p_motivazione text
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
begin
  if not public.approvvigionamento_carico_autorizzato() then
    raise exception 'Non autorizzato a creare un carico';
  end if;
  return public.approvvigionamento_crea_carico_interno(
    p_chiave, p_versione_id, p_data_prevista, p_righe, true, p_motivazione
  );
end;
$$;

create or replace function public.registra_arrivo_carico(
  p_chiave text,
  p_carico_id uuid,
  p_data_effettiva date,
  p_righe jsonb
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_operazione uuid;
  v_fornitore uuid;
  v_deleted timestamptz;
  v_riga jsonb;
  v_id uuid;
  v_prevista numeric;
  v_prima numeric;
  v_tipo text;
  v_compilate integer;
  v_totali integer;
  v_stato text;
  v_visti text[] := '{}';
begin
  if not public.approvvigionamento_carico_autorizzato() then
    raise exception 'Non autorizzato a registrare l''arrivo';
  end if;
  if p_data_effettiva is null or p_righe is null or jsonb_typeof(p_righe) <> 'array'
     or jsonb_array_length(p_righe) = 0 then
    raise exception 'Arrivo incompleto';
  end if;
  if (
    select count(*) from jsonb_array_elements(p_righe)
  ) <> (
    select count(distinct value->>'rigaId') from jsonb_array_elements(p_righe)
  ) then
    raise exception 'La stessa riga compare due volte nella richiesta';
  end if;

  select fornitore_id, deleted_at
    into v_fornitore, v_deleted
  from public.approvvigionamenti_carichi
  where id = p_carico_id
  for update;

  if v_fornitore is null or v_deleted is not null then
    raise exception 'Carico non disponibile';
  end if;

  v_operazione := public.approvvigionamento_acquisisci_operazione(
    p_chiave,
    'arrivo',
    jsonb_build_object('caricoId', p_carico_id, 'dataEffettiva', p_data_effettiva, 'righe', p_righe),
    p_carico_id
  );
  if v_operazione is null then
    select stato into v_stato from public.approvvigionamenti_carichi where id = p_carico_id;
    return jsonb_build_object('id', p_carico_id, 'riusata', true, 'stato', v_stato);
  end if;

  for v_riga in select value from jsonb_array_elements(p_righe) loop
    if v_riga->>'rigaId' is null or not jsonb_exists(v_riga, 'quantita')
       or jsonb_typeof(v_riga->'quantita') = 'null'
       or btrim(v_riga->>'quantita') = '' then
      raise exception 'Quantità non compilata';
    end if;
    if v_riga->>'rigaId' = any (v_visti) then
      raise exception 'La stessa riga compare due volte nella richiesta';
    end if;
    v_visti := v_visti || (v_riga->>'rigaId');

    select id, quantita_prevista, quantita_arrivata
      into v_id, v_prevista, v_prima
    from public.approvvigionamenti_carichi_righe
    where carico_id = p_carico_id
      and id = (v_riga->>'rigaId')::uuid
    for update;
    if v_id is null then
      raise exception 'Riga del carico non disponibile';
    end if;
    if (v_riga->>'quantita')::numeric < 0 then
      raise exception 'Quantità arrivata non valida';
    end if;
    v_tipo := case when v_prima is null then 'arrivo' else 'correzione' end;
    update public.approvvigionamenti_carichi_righe
    set quantita_arrivata = (v_riga->>'quantita')::numeric,
        updated_by = public.app_effective_uid()
    where id = v_id;
    insert into public.approvvigionamenti_carichi_eventi (carico_id, tipo, payload, created_by)
    values (
      p_carico_id,
      v_tipo,
      jsonb_build_object(
        'rigaId', v_id,
        'prima', v_prima,
        'arrivata', (v_riga->>'quantita')::numeric,
        'prevista', v_prevista,
        'dataEffettiva', p_data_effettiva
      ),
      public.app_effective_uid()
    );
  end loop;

  select count(*) filter (where quantita_arrivata is not null), count(*)
    into v_compilate, v_totali
  from public.approvvigionamenti_carichi_righe
  where carico_id = p_carico_id;

  v_stato := case
    when v_compilate = 0 then 'aperto'
    when v_compilate = v_totali then 'arrivato'
    else 'parziale'
  end;

  update public.approvvigionamenti_carichi
  set stato = v_stato,
      data_effettiva = case when v_compilate > 0 then p_data_effettiva else data_effettiva end,
      updated_by = public.app_effective_uid()
  where id = p_carico_id;

  return jsonb_build_object('id', p_carico_id, 'riusata', false, 'stato', v_stato);
end;
$$;

revoke all on function public.approvvigionamento_crea_carico_interno(text, uuid, date, jsonb, boolean, text)
  from public, anon, authenticated;
revoke all on function public.crea_carico_versione_storica(text, uuid, date, jsonb, text) from public, anon;
grant execute on function public.crea_carico_versione_storica(text, uuid, date, jsonb, text) to authenticated;
