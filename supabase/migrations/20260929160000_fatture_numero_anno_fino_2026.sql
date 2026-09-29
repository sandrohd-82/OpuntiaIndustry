-- Fino al 31/12/2026 il numero fiscale è NN/ANNO (es. 22/2026, 23/2026).
-- Dal 01/01/2027, in base alla data di emissione, diventa YY/CCCC (es. 27/0001).
-- Nessun job: la funzione sceglie il formato dall'anno della data.

create or replace function public.format_numero_fattura(p_anno int, p_progressivo int)
returns text
language sql
immutable
as $$
  select case
    when p_anno <= 2026 then lpad(p_progressivo::text, 2, '0') || '/' || p_anno::text
    else lpad((p_anno % 100)::text, 2, '0') || '/' || lpad(p_progressivo::text, 4, '0')
  end;
$$;

revoke all on function public.format_numero_fattura(int, int) from public;

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
  tetto int;
begin
  if p_data is null then
    raise exception 'Data emissione obbligatoria';
  end if;
  y := extract(year from p_data)::int;
  if y < 2000 or y > 2099 then
    raise exception 'Anno fattura non valido';
  end if;
  tetto := case when y <= 2026 then 99999 else 9999 end;

  insert into public.fatture_progressivo_anno (anno, ultimo_progressivo)
  values (y, 0)
  on conflict (anno) do nothing;

  update public.fatture_progressivo_anno
  set ultimo_progressivo = ultimo_progressivo + 1,
      updated_at = now()
  where anno = y
  returning ultimo_progressivo into n;

  if n is null or n > tetto then
    raise exception 'Progressivo fatture esaurito per l''anno %', y;
  end if;

  numero := public.format_numero_fattura(y, n);
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
  tetto int;
begin
  if p_data is null then
    raise exception 'Data emissione obbligatoria';
  end if;
  y := extract(year from p_data)::int;
  if y < 2000 or y > 2099 then
    raise exception 'Anno fattura non valido';
  end if;
  tetto := case when y <= 2026 then 99999 else 9999 end;

  select ultimo_progressivo into n
  from public.fatture_progressivo_anno
  where anno = y;

  n := coalesce(n, 0) + 1;
  if n > tetto then
    raise exception 'Progressivo fatture esaurito per l''anno %', y;
  end if;

  numero := public.format_numero_fattura(y, n);
  return jsonb_build_object(
    'numero_fattura', numero,
    'numero_interno', 'Ft-' || numero,
    'progressivo', n,
    'anno', y
  );
end;
$$;

create or replace function public.allinea_progressivo_fattura(p_numero text)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  n int;
  y int;
begin
  if p_numero is null then
    return;
  end if;

  -- NN/ANNO fino al 2026, es. 22/2026
  if p_numero ~ '^[0-9]+/20[0-9]{2}$' then
    n := split_part(p_numero, '/', 1)::int;
    y := split_part(p_numero, '/', 2)::int;
    if y > 2026 then
      return;
    end if;
  -- YY/CCCC dal 2027, es. 27/0001
  elsif p_numero ~ '^[0-9]{2}/[0-9]{4}$' then
    y := 2000 + substring(p_numero from 1 for 2)::int;
    n := substring(p_numero from 4)::int;
  else
    return;
  end if;

  insert into public.fatture_progressivo_anno (anno, ultimo_progressivo)
  values (y, n)
  on conflict (anno) do update
  set ultimo_progressivo = greatest(
        public.fatture_progressivo_anno.ultimo_progressivo,
        excluded.ultimo_progressivo
      ),
      updated_at = now();
end;
$$;

-- La serie manuale 2026 è già a 22. La fattura Nutriopuntia C00E prende quel numero
-- solo in archivio: nessun invio SDI.
with rinumerata as (
  update public.fatture_emesse
  set
    numero_fattura = '22/2026',
    numero_documento_esterno = '22/2026',
    numero_interno = 'Ft-22/2026',
    updated_at = now()
  where id = 'db352b43-6257-46a7-930b-b49d55d12725'
    and deleted_at is null
    and numero_fattura = '26-C00E/1'
  returning id, created_by
)
insert into public.audit_log (
  entity_type,
  entity_id,
  action,
  actor_id,
  summary,
  payload
)
select
  'fatture_emesse',
  id,
  'update',
  created_by,
  'Numero fiscale corretto in archivio a 22/2026, senza nuovo invio SDI',
  jsonb_build_object(
    'da', '26-C00E/1',
    'a', '22/2026',
    'sdi', false
  )
from rinumerata;

insert into public.fatture_progressivo_anno (anno, ultimo_progressivo)
values (2026, 22)
on conflict (anno) do update
set ultimo_progressivo = greatest(
      public.fatture_progressivo_anno.ultimo_progressivo,
      22
    ),
    updated_at = now();
