-- Numerazione fatture emesse: YY/CCCC (es. 26/0001).
-- Progressivo unico aziendale, riparte da 0001 ogni 1° gennaio.
-- Le fatture già emesse (es. Ft-26-C00E/1) non vengono rinumerate.
-- Il contatore non si decrementa: un numero assegnato non si riusa (D.P.R. 633/72).

create table if not exists public.fatture_progressivo_anno (
  anno smallint primary key check (anno between 2000 and 2099),
  ultimo_progressivo integer not null default 0 check (ultimo_progressivo >= 0 and ultimo_progressivo <= 9999),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  created_by uuid,
  updated_by uuid
);

comment on table public.fatture_progressivo_anno is
  'Contatore atomico fatture emesse per anno solare. Formato documento YY/CCCC.';

alter table public.fatture_progressivo_anno enable row level security;

comment on column public.fatture_emesse.numero_fattura is
  'Numero fiscale. Nuove emissioni: YY/CCCC (es. 26/0001). Storico targa (es. 26-C00E/1) invariato.';

comment on column public.fatture_emesse.numero_interno is
  'Riferimento interno. Nuove fatture: Ft-YY/CCCC. Storico Ft-AA-TARGA/N invariato. Note di credito: Nc-AA-TARGA/N.';

-- Allinea il contatore ai numeri YY/CCCC già presenti (anche soft-delete: il numero resta occupato).
insert into public.fatture_progressivo_anno (anno, ultimo_progressivo)
select
  (2000 + substring(numero_fattura from 1 for 2)::int)::smallint as anno,
  max(substring(numero_fattura from 4 for 4)::int) as ultimo_progressivo
from public.fatture_emesse
where coalesce(tipo_documento, 'fattura') = 'fattura'
  and numero_fattura ~ '^[0-9]{2}/[0-9]{4}$'
group by 1
on conflict (anno) do update
set ultimo_progressivo = greatest(
      public.fatture_progressivo_anno.ultimo_progressivo,
      excluded.ultimo_progressivo
    ),
    updated_at = now();

create unique index if not exists fatture_emesse_numero_yy_cccc_uidx
  on public.fatture_emesse (numero_fattura)
  where deleted_at is null
    and numero_fattura ~ '^[0-9]{2}/[0-9]{4}$';

create or replace function public.next_numero_fattura(p_data date)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  y int;
  yy text;
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
  yy := lpad((y % 100)::text, 2, '0');

  insert into public.fatture_progressivo_anno (anno, ultimo_progressivo)
  values (y, 0)
  on conflict (anno) do nothing;

  update public.fatture_progressivo_anno
  set ultimo_progressivo = ultimo_progressivo + 1,
      updated_at = now()
  where anno = y
  returning ultimo_progressivo into n;

  if n is null or n > 9999 then
    raise exception 'Progressivo fatture esaurito per l''anno %', y;
  end if;

  numero := yy || '/' || lpad(n::text, 4, '0');
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
  yy text;
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
  yy := lpad((y % 100)::text, 2, '0');

  select ultimo_progressivo into n
  from public.fatture_progressivo_anno
  where anno = y;

  n := coalesce(n, 0) + 1;
  if n > 9999 then
    raise exception 'Progressivo fatture esaurito per l''anno %', y;
  end if;

  numero := yy || '/' || lpad(n::text, 4, '0');
  return jsonb_build_object(
    'numero_fattura', numero,
    'numero_interno', 'Ft-' || numero,
    'progressivo', n,
    'anno', y
  );
end;
$$;

-- Se arriva un numero YY/CCCC già usato (import), il contatore non può tornare indietro.
create or replace function public.allinea_progressivo_fattura(p_numero text)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  yy int;
  n int;
  y int;
begin
  if p_numero is null or p_numero !~ '^[0-9]{2}/[0-9]{4}$' then
    return;
  end if;
  yy := substring(p_numero from 1 for 2)::int;
  n := substring(p_numero from 4 for 4)::int;
  y := 2000 + yy;

  insert into public.fatture_progressivo_anno (anno, ultimo_progressivo)
  values (y, n)
  on conflict (anno) do update
  set ultimo_progressivo = greatest(public.fatture_progressivo_anno.ultimo_progressivo, excluded.ultimo_progressivo),
      updated_at = now();
end;
$$;

revoke all on function public.next_numero_fattura(date) from public;
revoke all on function public.anteprima_numero_fattura(date) from public;
revoke all on function public.allinea_progressivo_fattura(text) from public;
grant execute on function public.next_numero_fattura(date) to authenticated, service_role;
grant execute on function public.anteprima_numero_fattura(date) to authenticated, service_role;
grant execute on function public.allinea_progressivo_fattura(text) to authenticated, service_role;
