-- Coda provvisoria dei numeri fattura.
-- Il contatore fiscale non avanza finché il numero non è emesso davvero.
-- Chi completa prima, tra le prenotazioni in corso, si aggiudica il più basso.
-- La fattura prenotata resta senza numero_fattura fiscale finché non si emette.

create table if not exists public.fatture_numeri_prenotati (
  id uuid primary key default gen_random_uuid(),
  anno smallint not null check (anno between 2000 and 2099),
  progressivo integer not null check (progressivo > 0 and progressivo <= 2000000),
  numero_fattura text not null,
  stato text not null check (stato in ('in_corso', 'aggiudicata', 'rilasciata', 'emessa')),
  sessione_id text not null,
  contesto text not null check (contesto in ('ordine', 'fattura')),
  ordine_id uuid,
  fattura_id uuid,
  heartbeat_at timestamptz not null default now(),
  scade_at timestamptz not null default (now() + interval '20 minutes'),
  aggiudicata_at timestamptz,
  rilasciata_at timestamptz,
  emessa_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  created_by uuid,
  updated_by uuid,
  deleted_at timestamptz,
  deleted_by uuid
);

comment on table public.fatture_numeri_prenotati is
  'Prenotazione provvisoria del numero fattura. in_corso finché l''operatore crea; aggiudicata al completamento senza consumare il contatore; emessa all''invio fiscale; rilasciata se abbandona.';

create unique index if not exists fatture_numeri_prenotati_slot_uidx
  on public.fatture_numeri_prenotati (anno, progressivo)
  where deleted_at is null and stato in ('in_corso', 'aggiudicata');

create unique index if not exists fatture_numeri_prenotati_sessione_uidx
  on public.fatture_numeri_prenotati (sessione_id)
  where deleted_at is null and stato = 'in_corso';

create index if not exists fatture_numeri_prenotati_fattura_idx
  on public.fatture_numeri_prenotati (fattura_id)
  where deleted_at is null and stato = 'aggiudicata';

alter table public.fatture_numeri_prenotati enable row level security;

drop policy if exists "fatture_numeri_prenotati_select" on public.fatture_numeri_prenotati;
create policy "fatture_numeri_prenotati_select"
  on public.fatture_numeri_prenotati for select
  to authenticated
  using (
    public.has_area_access('commerciale')
    or public.has_area_access('amministrazione')
    or public.is_superadmin()
  );

grant select on public.fatture_numeri_prenotati to authenticated, service_role;

create or replace function public.fatture_numero_autorizza()
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  uid uuid := auth.uid();
begin
  if uid is null then
    raise exception 'Accesso richiesto';
  end if;
  if not (
    public.has_area_access('commerciale')
    or public.has_area_access('amministrazione')
    or public.is_superadmin()
  ) then
    raise exception 'Permesso negato sulla numerazione fatture';
  end if;
  return uid;
end;
$$;

create or replace function public.fatture_progressivo_libero(p_anno int)
returns int
language plpgsql
security definer
set search_path = public
as $$
declare
  n int := 0;
  ultimo int;
  tetto int;
  numero text;
begin
  tetto := case when p_anno <= 2026 then 99999 else 9999 end;
  select ultimo_progressivo into ultimo
  from public.fatture_progressivo_anno
  where anno = p_anno;
  ultimo := coalesce(ultimo, 0);

  loop
    n := n + 1;
    if n > tetto then
      raise exception 'Progressivo fatture esaurito per l''anno %', p_anno;
    end if;

    if exists (
      select 1
      from public.fatture_numeri_prenotati
      where anno = p_anno
        and progressivo = n
        and deleted_at is null
        and stato in ('in_corso', 'aggiudicata', 'emessa')
    ) then
      continue;
    end if;

    numero := public.format_numero_fattura(p_anno, n);
    if exists (
      select 1
      from public.fatture_emesse
      where numero_fattura = numero
         or numero_documento_esterno = numero
         or numero_interno = 'Ft-' || numero
    ) then
      continue;
    end if;

    if n <= ultimo and not exists (
      select 1
      from public.fatture_numeri_prenotati
      where anno = p_anno
        and progressivo = n
    ) then
      continue;
    end if;

    return n;
  end loop;
end;
$$;

create or replace function public.fatture_scadi_prenotazioni(p_anno int)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  with scadute as (
    update public.fatture_numeri_prenotati
    set stato = 'rilasciata',
        rilasciata_at = now(),
        deleted_at = now(),
        deleted_by = coalesce(auth.uid(), created_by),
        updated_at = now(),
        updated_by = coalesce(auth.uid(), updated_by)
    where anno = p_anno
      and stato = 'in_corso'
      and deleted_at is null
      and heartbeat_at < now() - interval '20 minutes'
    returning id, numero_fattura, created_by
  )
  insert into public.audit_log (entity_type, entity_id, action, actor_id, summary, payload)
  select
    'fatture_numeri_prenotati',
    id,
    'soft_delete',
    created_by,
    'Prenotazione numero ' || numero_fattura || ' scaduta: finestra abbandonata, numero rilasciato.',
    jsonb_build_object('motivo', 'heartbeat', 'numero_fattura', numero_fattura)
  from scadute;
end;
$$;

create or replace function public.fatture_ricompatta_prenotazioni(p_anno int)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_prima jsonb := '{}'::jsonb;
  r record;
  n int;
  v_old int;
  v_testo text;
begin
  select coalesce(jsonb_object_agg(id::text, progressivo), '{}'::jsonb)
  into v_prima
  from public.fatture_numeri_prenotati
  where anno = p_anno
    and stato = 'in_corso'
    and deleted_at is null
    and progressivo < 1000000;

  update public.fatture_numeri_prenotati
  set progressivo = progressivo + 1000000,
      updated_at = now()
  where anno = p_anno
    and stato = 'in_corso'
    and deleted_at is null
    and progressivo < 1000000;

  for r in
    select id
    from public.fatture_numeri_prenotati
    where anno = p_anno
      and stato = 'in_corso'
      and deleted_at is null
    order by created_at, id
  loop
    n := public.fatture_progressivo_libero(p_anno);
    v_testo := public.format_numero_fattura(p_anno, n);
    update public.fatture_numeri_prenotati
    set progressivo = n,
        numero_fattura = v_testo,
        updated_at = now(),
        updated_by = coalesce(auth.uid(), updated_by)
    where id = r.id;
  end loop;

  for r in
    select id, progressivo, numero_fattura
    from public.fatture_numeri_prenotati
    where anno = p_anno
      and stato = 'in_corso'
      and deleted_at is null
  loop
    v_old := null;
    if jsonb_exists(v_prima, r.id::text) then
      v_old := (v_prima ->> r.id::text)::int;
    end if;
    if v_old is not null and v_old <> r.progressivo then
      insert into public.audit_log (entity_type, entity_id, action, actor_id, summary, payload)
      values (
        'fatture_numeri_prenotati',
        r.id,
        'update',
        auth.uid(),
        'Numero provvisorio riassegnato da '
          || public.format_numero_fattura(p_anno, v_old)
          || ' a '
          || r.numero_fattura
          || '.',
        jsonb_build_object(
          'da', public.format_numero_fattura(p_anno, v_old),
          'a', r.numero_fattura
        )
      );
    end if;
  end loop;
end;
$$;

create or replace function public.fatture_prenotazione_snapshot(p_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  r public.fatture_numeri_prenotati%rowtype;
  cnt int;
  pmin int;
  pmax int;
begin
  select * into r
  from public.fatture_numeri_prenotati
  where id = p_id;
  if not found then
    raise exception 'Prenotazione numero non trovata';
  end if;

  select count(*)::int, min(progressivo), max(progressivo)
  into cnt, pmin, pmax
  from public.fatture_numeri_prenotati
  where anno = r.anno
    and stato = 'in_corso'
    and deleted_at is null;

  cnt := coalesce(cnt, 0);
  return jsonb_build_object(
    'id', r.id,
    'numero_fattura', r.numero_fattura,
    'progressivo', r.progressivo,
    'anno', r.anno,
    'stato', r.stato,
    'incerto', r.stato = 'in_corso' and cnt > 1,
    'numero_min', case
      when cnt > 0 then public.format_numero_fattura(r.anno, pmin)
      else r.numero_fattura
    end,
    'numero_max', case
      when cnt > 0 then public.format_numero_fattura(r.anno, pmax)
      else r.numero_fattura
    end,
    'altri', case when r.stato = 'in_corso' then greatest(cnt - 1, 0) else 0 end,
    'ordine_id', r.ordine_id,
    'fattura_id', r.fattura_id
  );
end;
$$;

create or replace function public.fatture_blocca_anno(p_anno int)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.fatture_progressivo_anno (anno, ultimo_progressivo)
  values (p_anno, 0)
  on conflict (anno) do nothing;

  perform 1
  from public.fatture_progressivo_anno
  where anno = p_anno
  for update;
end;
$$;

create or replace function public.prenota_numero_fattura(
  p_data date,
  p_sessione text,
  p_contesto text
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  uid uuid;
  y int;
  v_id uuid;
  v_slot int;
begin
  uid := public.fatture_numero_autorizza();
  if p_data is null then
    raise exception 'Data emissione obbligatoria';
  end if;
  y := extract(year from p_data)::int;
  if y < 2000 or y > 2099 then
    raise exception 'Anno fattura non valido';
  end if;
  if p_contesto not in ('ordine', 'fattura') then
    raise exception 'Contesto prenotazione non valido';
  end if;
  if coalesce(trim(p_sessione), '') = '' then
    raise exception 'Sessione prenotazione obbligatoria';
  end if;

  perform public.fatture_blocca_anno(y);
  perform public.fatture_scadi_prenotazioni(y);

  select id into v_id
  from public.fatture_numeri_prenotati
  where sessione_id = trim(p_sessione)
    and stato = 'in_corso'
    and deleted_at is null
  limit 1;

  if v_id is not null then
    update public.fatture_numeri_prenotati
    set heartbeat_at = now(),
        scade_at = now() + interval '20 minutes',
        updated_at = now(),
        updated_by = uid
    where id = v_id;
    perform public.fatture_ricompatta_prenotazioni(y);
    return public.fatture_prenotazione_snapshot(v_id);
  end if;

  select coalesce(max(progressivo), 1000000) + 1
  into v_slot
  from public.fatture_numeri_prenotati
  where anno = y
    and progressivo >= 1000000;

  insert into public.fatture_numeri_prenotati (
    anno,
    progressivo,
    numero_fattura,
    stato,
    sessione_id,
    contesto,
    heartbeat_at,
    scade_at,
    created_by,
    updated_by
  )
  values (
    y,
    v_slot,
    'PREN',
    'in_corso',
    trim(p_sessione),
    p_contesto,
    now(),
    now() + interval '20 minutes',
    uid,
    uid
  )
  returning id into v_id;

  perform public.fatture_ricompatta_prenotazioni(y);

  insert into public.audit_log (entity_type, entity_id, action, actor_id, summary, payload)
  select
    'fatture_numeri_prenotati',
    id,
    'create',
    uid,
    'Numero ' || numero_fattura || ' prenotato in bozza (' || contesto || '). Non è ancora emesso.',
    jsonb_build_object(
      'numero_fattura', numero_fattura,
      'contesto', contesto,
      'sessione_id', sessione_id
    )
  from public.fatture_numeri_prenotati
  where id = v_id;

  return public.fatture_prenotazione_snapshot(v_id);
end;
$$;

create or replace function public.heartbeat_numero_fattura(p_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  uid uuid;
  r public.fatture_numeri_prenotati%rowtype;
begin
  uid := public.fatture_numero_autorizza();
  select * into r
  from public.fatture_numeri_prenotati
  where id = p_id;
  if not found then
    raise exception 'Prenotazione numero non trovata';
  end if;
  if r.created_by is distinct from uid and not public.is_superadmin() then
    raise exception 'Prenotazione di un altro operatore';
  end if;

  perform public.fatture_blocca_anno(r.anno);
  perform public.fatture_scadi_prenotazioni(r.anno);

  select * into r
  from public.fatture_numeri_prenotati
  where id = p_id;
  if r.stato <> 'in_corso' or r.deleted_at is not null then
    return public.fatture_prenotazione_snapshot(p_id);
  end if;

  update public.fatture_numeri_prenotati
  set heartbeat_at = now(),
      scade_at = now() + interval '20 minutes',
      updated_at = now(),
      updated_by = uid
  where id = p_id;

  perform public.fatture_ricompatta_prenotazioni(r.anno);
  return public.fatture_prenotazione_snapshot(p_id);
end;
$$;

create or replace function public.rilascia_numero_fattura(p_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  uid uuid;
  r public.fatture_numeri_prenotati%rowtype;
begin
  uid := public.fatture_numero_autorizza();
  select * into r from public.fatture_numeri_prenotati where id = p_id;
  if not found then
    raise exception 'Prenotazione numero non trovata';
  end if;
  perform public.fatture_blocca_anno(r.anno);
  select * into r from public.fatture_numeri_prenotati where id = p_id for update;
  if r.created_by is distinct from uid and not public.is_superadmin() then
    raise exception 'Prenotazione di un altro operatore';
  end if;
  if r.stato <> 'in_corso' or r.deleted_at is not null then
    return public.fatture_prenotazione_snapshot(p_id);
  end if;

  update public.fatture_numeri_prenotati
  set stato = 'rilasciata',
      rilasciata_at = now(),
      deleted_at = now(),
      deleted_by = uid,
      updated_at = now(),
      updated_by = uid
  where id = p_id;

  insert into public.audit_log (entity_type, entity_id, action, actor_id, summary, payload)
  values (
    'fatture_numeri_prenotati',
    p_id,
    'soft_delete',
    uid,
    'Numero ' || r.numero_fattura || ' rilasciato: operazione non completata.',
    jsonb_build_object('numero_fattura', r.numero_fattura, 'motivo', 'abbandono')
  );

  perform public.fatture_ricompatta_prenotazioni(r.anno);
  return public.fatture_prenotazione_snapshot(p_id);
end;
$$;

create or replace function public.aggiudica_numero_fattura(
  p_id uuid,
  p_ordine_id uuid default null,
  p_fattura_id uuid default null
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  uid uuid;
  r public.fatture_numeri_prenotati%rowtype;
  v_holder uuid;
  v_min int;
begin
  uid := public.fatture_numero_autorizza();
  select * into r from public.fatture_numeri_prenotati where id = p_id;
  if not found then
    raise exception 'Prenotazione numero non trovata';
  end if;
  if r.created_by is distinct from uid and not public.is_superadmin() then
    raise exception 'Prenotazione di un altro operatore';
  end if;
  if r.stato = 'aggiudicata' and r.deleted_at is null then
    return public.fatture_prenotazione_snapshot(p_id);
  end if;
  if r.stato <> 'in_corso' or r.deleted_at is not null then
    raise exception 'La prenotazione non è più in corso';
  end if;

  perform public.fatture_blocca_anno(r.anno);
  perform public.fatture_scadi_prenotazioni(r.anno);
  perform public.fatture_ricompatta_prenotazioni(r.anno);

  select * into r from public.fatture_numeri_prenotati where id = p_id for update;
  if r.stato <> 'in_corso' or r.deleted_at is not null then
    raise exception 'La prenotazione non è più in corso';
  end if;

  select id, progressivo
  into v_holder, v_min
  from public.fatture_numeri_prenotati
  where anno = r.anno
    and stato = 'in_corso'
    and deleted_at is null
  order by progressivo
  limit 1;

  if v_holder is distinct from r.id then
    update public.fatture_numeri_prenotati
    set progressivo = progressivo + 1000000,
        updated_at = now()
    where id = v_holder
      and progressivo < 1000000;
  end if;

  update public.fatture_numeri_prenotati
  set stato = 'aggiudicata',
      progressivo = v_min,
      numero_fattura = public.format_numero_fattura(r.anno, v_min),
      aggiudicata_at = now(),
      ordine_id = coalesce(p_ordine_id, ordine_id),
      fattura_id = coalesce(p_fattura_id, fattura_id),
      updated_at = now(),
      updated_by = uid
  where id = r.id;

  perform public.fatture_ricompatta_prenotazioni(r.anno);

  if v_holder is distinct from r.id then
    insert into public.audit_log (entity_type, entity_id, action, actor_id, summary, payload)
    select
      'fatture_numeri_prenotati',
      id,
      'update',
      uid,
      'Numero provvisorio spostato a ' || numero_fattura || ': un altro operatore ha completato prima.',
      jsonb_build_object('numero_fattura', numero_fattura, 'motivo', 'aggiudicazione_altrui')
    from public.fatture_numeri_prenotati
    where id = v_holder;
  end if;

  insert into public.audit_log (entity_type, entity_id, action, actor_id, summary, payload)
  select
    'fatture_numeri_prenotati',
    id,
    'status_change',
    uid,
    'Numero ' || numero_fattura || ' aggiudicato. Resta riservato, il contatore fiscale non è stato consumato.',
    jsonb_build_object(
      'numero_fattura', numero_fattura,
      'ordine_id', ordine_id,
      'fattura_id', fattura_id,
      'contatore_consumato', false
    )
  from public.fatture_numeri_prenotati
  where id = r.id;

  return public.fatture_prenotazione_snapshot(r.id);
end;
$$;

create or replace function public.emetti_numero_prenotato(p_id uuid, p_data date)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  uid uuid;
  r public.fatture_numeri_prenotati%rowtype;
  numero text;
begin
  uid := public.fatture_numero_autorizza();
  if p_data is null then
    raise exception 'Data emissione obbligatoria';
  end if;

  select * into r from public.fatture_numeri_prenotati where id = p_id;
  if not found then
    raise exception 'Prenotazione numero non trovata';
  end if;

  if r.stato = 'in_corso' and r.deleted_at is null then
    perform public.aggiudica_numero_fattura(p_id, r.ordine_id, r.fattura_id);
  end if;

  select * into r from public.fatture_numeri_prenotati where id = p_id for update;
  if r.stato <> 'aggiudicata' or r.deleted_at is not null then
    raise exception 'Nessun numero aggiudicato da emettere';
  end if;

  perform public.fatture_blocca_anno(r.anno);
  numero := public.format_numero_fattura(r.anno, r.progressivo);

  if exists (
    select 1
    from public.fatture_emesse
    where numero_fattura = numero
       or numero_documento_esterno = numero
       or numero_interno = 'Ft-' || numero
  ) then
    raise exception 'Il numero % risulta già registrato', numero;
  end if;

  update public.fatture_numeri_prenotati
  set stato = 'emessa',
      emessa_at = now(),
      numero_fattura = numero,
      updated_at = now(),
      updated_by = uid
  where id = r.id;

  update public.fatture_progressivo_anno
  set ultimo_progressivo = greatest(ultimo_progressivo, r.progressivo),
      updated_at = now(),
      updated_by = uid
  where anno = r.anno;

  insert into public.audit_log (entity_type, entity_id, action, actor_id, summary, payload)
  values (
    'fatture_numeri_prenotati',
    r.id,
    'status_change',
    uid,
    'Numero ' || numero || ' emesso. Il contatore fiscale è stato allineato.',
    jsonb_build_object('numero_fattura', numero, 'contatore_consumato', true)
  );

  return jsonb_build_object(
    'numero_fattura', numero,
    'numero_interno', 'Ft-' || numero,
    'progressivo', r.progressivo,
    'anno', r.anno
  );
end;
$$;

create or replace function public.leggi_prenotazione_fattura(p_fattura_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_id uuid;
begin
  perform public.fatture_numero_autorizza();
  select id into v_id
  from public.fatture_numeri_prenotati
  where fattura_id = p_fattura_id
    and stato = 'aggiudicata'
    and deleted_at is null
  order by aggiudicata_at desc nulls last
  limit 1;
  if v_id is null then
    return null;
  end if;
  return public.fatture_prenotazione_snapshot(v_id);
end;
$$;

create or replace function public.next_numero_fattura(p_data date)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  y int;
  n int;
  numero text;
begin
  if p_data is null then
    raise exception 'Data emissione obbligatoria';
  end if;
  y := extract(year from p_data)::int;
  if y < 2000 or y > 2099 then
    raise exception 'Anno fattura non valido';
  end if;

  perform public.fatture_blocca_anno(y);
  perform public.fatture_scadi_prenotazioni(y);
  perform public.fatture_ricompatta_prenotazioni(y);
  n := public.fatture_progressivo_libero(y);
  numero := public.format_numero_fattura(y, n);

  update public.fatture_progressivo_anno
  set ultimo_progressivo = greatest(ultimo_progressivo, n),
      updated_at = now()
  where anno = y;

  return jsonb_build_object(
    'numero_fattura', numero,
    'numero_interno', 'Ft-' || numero,
    'progressivo', n,
    'anno', y
  );
end;
$$;

create or replace function public.anteprima_numero_fattura(p_data date)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  y int;
  n int;
  numero text;
begin
  if p_data is null then
    raise exception 'Data emissione obbligatoria';
  end if;
  y := extract(year from p_data)::int;
  if y < 2000 or y > 2099 then
    raise exception 'Anno fattura non valido';
  end if;

  perform public.fatture_blocca_anno(y);
  perform public.fatture_scadi_prenotazioni(y);
  perform public.fatture_ricompatta_prenotazioni(y);
  n := public.fatture_progressivo_libero(y);
  numero := public.format_numero_fattura(y, n);
  return jsonb_build_object(
    'numero_fattura', numero,
    'numero_interno', 'Ft-' || numero,
    'progressivo', n,
    'anno', y
  );
end;
$$;

revoke all on function public.fatture_numero_autorizza() from public, anon, authenticated;
revoke all on function public.fatture_progressivo_libero(int) from public, anon, authenticated;
revoke all on function public.fatture_scadi_prenotazioni(int) from public, anon, authenticated;
revoke all on function public.fatture_ricompatta_prenotazioni(int) from public, anon, authenticated;
revoke all on function public.fatture_prenotazione_snapshot(uuid) from public, anon, authenticated;
revoke all on function public.fatture_blocca_anno(int) from public, anon, authenticated;

revoke all on function public.prenota_numero_fattura(date, text, text) from public;
revoke all on function public.heartbeat_numero_fattura(uuid) from public;
revoke all on function public.rilascia_numero_fattura(uuid) from public;
revoke all on function public.aggiudica_numero_fattura(uuid, uuid, uuid) from public;
revoke all on function public.emetti_numero_prenotato(uuid, date) from public;
revoke all on function public.leggi_prenotazione_fattura(uuid) from public;

grant execute on function public.prenota_numero_fattura(date, text, text) to authenticated, service_role;
grant execute on function public.heartbeat_numero_fattura(uuid) to authenticated, service_role;
grant execute on function public.rilascia_numero_fattura(uuid) to authenticated, service_role;
grant execute on function public.aggiudica_numero_fattura(uuid, uuid, uuid) to authenticated, service_role;
grant execute on function public.emetti_numero_prenotato(uuid, date) to authenticated, service_role;
grant execute on function public.leggi_prenotazione_fattura(uuid) to authenticated, service_role;
