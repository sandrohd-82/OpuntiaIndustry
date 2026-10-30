-- La proforma ha la serie propria 14/2026, 15/2026, …
-- Non consuma e non blocca il progressivo fiscale, anche se il testo coincide.

create or replace function public.format_numero_proforma(p_anno int, p_progressivo int)
returns text
language sql
immutable
as $$
  select p_progressivo::text || '/' || p_anno::text;
$$;

create or replace function public.next_numero_proforma(p_data date)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  y int;
  n int;
  ultimo int;
  numero text;
begin
  if p_data is null then
    raise exception 'Data documento obbligatoria';
  end if;
  y := extract(year from p_data)::int;
  if y < 2000 or y > 2099 then
    raise exception 'Anno proforma non valido';
  end if;

  insert into public.proforme_progressivo_anno (anno, ultimo_progressivo)
  values (y, 0)
  on conflict (anno) do nothing;

  select ultimo_progressivo into ultimo
  from public.proforme_progressivo_anno
  where anno = y
  for update;
  ultimo := coalesce(ultimo, 0);
  n := ultimo;

  loop
    n := n + 1;
    if n > 99999 then
      raise exception 'Progressivo proforme esaurito per l''anno %', y;
    end if;
    numero := public.format_numero_proforma(y, n);
    exit when not exists (
      select 1
      from public.fatture_emesse
      where deleted_at is null
        and tipo_documento = 'proforma'
        and (
          numero_fattura = numero
          or numero_documento_esterno = numero
        )
    );
  end loop;

  update public.proforme_progressivo_anno
  set ultimo_progressivo = n,
      updated_at = now()
  where anno = y;

  return jsonb_build_object(
    'numero_fattura', numero,
    'numero_interno', numero,
    'progressivo', n,
    'anno', y
  );
end;
$$;

create or replace function public.anteprima_numero_proforma(p_data date)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  y int;
  n int;
  ultimo int;
  numero text;
begin
  if p_data is null then
    raise exception 'Data documento obbligatoria';
  end if;
  y := extract(year from p_data)::int;
  if y < 2000 or y > 2099 then
    raise exception 'Anno proforma non valido';
  end if;

  select ultimo_progressivo into ultimo
  from public.proforme_progressivo_anno
  where anno = y;
  ultimo := coalesce(ultimo, 0);
  n := ultimo;

  loop
    n := n + 1;
    if n > 99999 then
      raise exception 'Progressivo proforme esaurito per l''anno %', y;
    end if;
    numero := public.format_numero_proforma(y, n);
    exit when not exists (
      select 1
      from public.fatture_emesse
      where deleted_at is null
        and tipo_documento = 'proforma'
        and (
          numero_fattura = numero
          or numero_documento_esterno = numero
        )
    );
  end loop;

  return jsonb_build_object(
    'numero_fattura', numero,
    'numero_interno', numero,
    'progressivo', n,
    'anno', y
  );
end;
$$;

revoke all on function public.next_numero_proforma(date) from public;
revoke all on function public.anteprima_numero_proforma(date) from public;
grant execute on function public.next_numero_proforma(date) to authenticated, service_role;
grant execute on function public.anteprima_numero_proforma(date) to authenticated, service_role;

insert into public.proforme_progressivo_anno (anno, ultimo_progressivo)
values (2026, 13)
on conflict (anno) do update
set ultimo_progressivo = 13,
    updated_at = now()
where public.proforme_progressivo_anno.ultimo_progressivo < 13;

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
      where (
          numero_fattura = numero
          or numero_documento_esterno = numero
          or numero_interno = 'Ft-' || numero
        )
        and tipo_documento is distinct from 'proforma'
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

create or replace function public.assegna_numero_fattura_sdi(
  p_fattura_id uuid,
  p_data date
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  uid uuid;
  y int;
  n int;
  ultimo int;
  tetto int;
  numero text;
  interno text;
  gia text;
begin
  uid := auth.uid();
  if uid is null then
    raise exception 'Accesso richiesto';
  end if;
  if not (
    public.has_area_access('commerciale')
    or public.has_area_access('amministrazione')
    or public.has_area_access('produzione')
    or public.is_superadmin()
  ) then
    raise exception 'Permesso negato sulla numerazione fatture';
  end if;
  if p_data is null then
    raise exception 'Data emissione obbligatoria';
  end if;
  y := extract(year from p_data)::int;
  if y < 2000 or y > 2099 then
    raise exception 'Anno fattura non valido';
  end if;
  tetto := case when y <= 2026 then 99999 else 9999 end;

  if p_fattura_id is not null then
    select numero_fattura into gia
    from public.fatture_emesse
    where id = p_fattura_id
      and deleted_at is null
    for update;
    if not found then
      raise exception 'Fattura non trovata';
    end if;
    if gia ~ '^[0-9]+/20[0-9]{2}$' or gia ~ '^[0-9]{2}/[0-9]{4}$' then
      interno := 'Ft-' || gia;
      return jsonb_build_object(
        'numero_fattura', gia,
        'numero_interno', interno,
        'riusato', true
      );
    end if;
  end if;

  perform public.fatture_blocca_anno(y);

  update public.fatture_numeri_prenotati
  set stato = 'rilasciata',
      rilasciata_at = now(),
      deleted_at = now(),
      updated_at = now(),
      updated_by = uid
  where anno = y
    and deleted_at is null
    and stato in ('in_corso', 'aggiudicata');

  select ultimo_progressivo into ultimo
  from public.fatture_progressivo_anno
  where anno = y
  for update;
  ultimo := coalesce(ultimo, 0);
  n := ultimo;

  loop
    n := n + 1;
    if n > tetto then
      raise exception 'Progressivo fatture esaurito per l''anno %', y;
    end if;
    numero := public.format_numero_fattura(y, n);
    if exists (
      select 1
      from public.fatture_emesse
      where deleted_at is null
        and tipo_documento is distinct from 'proforma'
        and (
          numero_fattura = numero
          or numero_documento_esterno = numero
          or numero_interno = 'Ft-' || numero
        )
    ) then
      continue;
    end if;
    if exists (
      select 1
      from public.fatture_numeri_prenotati
      where anno = y
        and progressivo = n
        and deleted_at is null
        and stato = 'emessa'
    ) then
      continue;
    end if;
    exit;
  end loop;

  interno := 'Ft-' || numero;

  if p_fattura_id is not null then
    update public.fatture_emesse
    set numero_fattura = numero,
        numero_interno = interno,
        numero_documento_esterno = numero,
        updated_at = now(),
        updated_by = uid
    where id = p_fattura_id
      and deleted_at is null;
  end if;

  update public.fatture_progressivo_anno
  set ultimo_progressivo = greatest(ultimo_progressivo, n),
      updated_at = now(),
      updated_by = uid
  where anno = y;

  insert into public.fatture_numeri_prenotati (
    anno,
    progressivo,
    numero_fattura,
    stato,
    sessione_id,
    contesto,
    fattura_id,
    emessa_at,
    created_by,
    updated_by
  )
  values (
    y,
    n,
    numero,
    'emessa',
    'sdi-' || coalesce(p_fattura_id::text, gen_random_uuid()::text),
    'fattura',
    p_fattura_id,
    now(),
    uid,
    uid
  );

  insert into public.audit_log (
    entity_type,
    entity_id,
    action,
    actor_id,
    summary,
    payload
  )
  values (
    'fatture_emesse',
    coalesce(p_fattura_id, gen_random_uuid()),
    'status_change',
    uid,
    'Numero ' || numero || ' assegnato all''invio allo SDI.',
    jsonb_build_object(
      'numero_fattura', numero,
      'fattura_id', p_fattura_id,
      'contatore_consumato', true
    )
  );

  return jsonb_build_object(
    'numero_fattura', numero,
    'numero_interno', interno,
    'progressivo', n,
    'anno', y,
    'riusato', false
  );
end;
$$;

revoke all on function public.assegna_numero_fattura_sdi(uuid, date) from public;
grant execute on function public.assegna_numero_fattura_sdi(uuid, date) to authenticated, service_role;
