-- Il numero fiscale si assegna solo all'invio allo SDI, dentro un unico blocco.
-- Una bozza, anche di un mese prima, non tiene occupato un progressivo.

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

-- Prenotazioni non emesse: non tengono più un numero.
update public.fatture_numeri_prenotati
set stato = 'rilasciata',
    rilasciata_at = now(),
    deleted_at = now(),
    updated_at = now()
where deleted_at is null
  and stato in ('in_corso', 'aggiudicata');

-- Un'emissione locale il cui documento non esiste più non blocca il progressivo.
update public.fatture_numeri_prenotati p
set stato = 'rilasciata',
    rilasciata_at = now(),
    deleted_at = now(),
    updated_at = now()
where p.deleted_at is null
  and p.stato = 'emessa'
  and not exists (
    select 1
    from public.fatture_emesse f
    where f.deleted_at is null
      and (
        f.numero_fattura = p.numero_fattura
        or f.numero_documento_esterno = p.numero_fattura
        or f.numero_interno = 'Ft-' || p.numero_fattura
      )
  );

-- Il 22/2026 è stato segnato emesso e poi il documento è stato tolto senza SDI.
-- Si libera solo quel progressivo: la serie già usata prima resta dov'è.
update public.fatture_progressivo_anno c
set ultimo_progressivo = 21,
    updated_at = now()
where c.anno = 2026
  and c.ultimo_progressivo = 22
  and not exists (
    select 1
    from public.fatture_emesse f
    where f.deleted_at is null
      and (
        f.numero_fattura = '22/2026'
        or f.numero_documento_esterno = '22/2026'
        or f.numero_interno = 'Ft-22/2026'
      )
  );

insert into public.audit_log (
  entity_type,
  entity_id,
  action,
  actor_id,
  summary,
  payload
)
select
  'fatture_progressivo_anno',
  gen_random_uuid(),
  'update',
  null,
  'Contatore 2026 allineato alle fatture vive. I numeri solo prenotati sono stati rilasciati: il prossimo si prende all''invio allo SDI.',
  jsonb_build_object(
    'anno', 2026,
    'ultimo_progressivo', c.ultimo_progressivo
  )
from public.fatture_progressivo_anno c
where c.anno = 2026;
