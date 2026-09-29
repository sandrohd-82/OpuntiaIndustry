-- Proforma: serie propria PR-01/2026, non consuma il progressivo fiscale.
-- Conversione: la fattura definitiva prende il numero NN/ANNO o, dal 2027, YY/CCCC.

alter table public.fatture_emesse
  drop constraint if exists fatture_emesse_tipo_documento_check;

alter table public.fatture_emesse
  add constraint fatture_emesse_tipo_documento_check
  check (tipo_documento in ('fattura', 'nota_credito', 'proforma'));

alter table public.fatture_emesse
  add column if not exists fattura_definitiva_id uuid references public.fatture_emesse (id),
  add column if not exists proforma_origine_id uuid references public.fatture_emesse (id);

comment on column public.fatture_emesse.fattura_definitiva_id is
  'Sulla proforma: fattura fiscale nata dalla conversione. Vuoto finché non è convertita.';
comment on column public.fatture_emesse.proforma_origine_id is
  'Sulla fattura fiscale: proforma da cui è stata convertita.';

create index if not exists fatture_emesse_fattura_definitiva_idx
  on public.fatture_emesse (fattura_definitiva_id)
  where deleted_at is null and fattura_definitiva_id is not null;

create table if not exists public.proforme_progressivo_anno (
  anno smallint primary key check (anno between 2000 and 2099),
  ultimo_progressivo integer not null default 0 check (ultimo_progressivo >= 0),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  created_by uuid,
  updated_by uuid
);

alter table public.proforme_progressivo_anno enable row level security;

create or replace function public.format_numero_proforma(p_anno int, p_progressivo int)
returns text
language sql
immutable
as $$
  select 'PR-' || lpad(p_progressivo::text, 2, '0') || '/' || p_anno::text;
$$;

revoke all on function public.format_numero_proforma(int, int) from public;

create or replace function public.next_numero_proforma(p_data date)
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
    raise exception 'Data documento obbligatoria';
  end if;
  y := extract(year from p_data)::int;
  if y < 2000 or y > 2099 then
    raise exception 'Anno proforma non valido';
  end if;

  insert into public.proforme_progressivo_anno (anno, ultimo_progressivo)
  values (y, 0)
  on conflict (anno) do nothing;

  update public.proforme_progressivo_anno
  set ultimo_progressivo = ultimo_progressivo + 1,
      updated_at = now()
  where anno = y
  returning ultimo_progressivo into n;

  if n is null or n > 99999 then
    raise exception 'Progressivo proforme esaurito per l''anno %', y;
  end if;

  numero := public.format_numero_proforma(y, n);
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
  numero text;
begin
  if p_data is null then
    raise exception 'Data documento obbligatoria';
  end if;
  y := extract(year from p_data)::int;
  if y < 2000 or y > 2099 then
    raise exception 'Anno proforma non valido';
  end if;

  select ultimo_progressivo into n
  from public.proforme_progressivo_anno
  where anno = y;

  n := coalesce(n, 0) + 1;
  numero := public.format_numero_proforma(y, n);
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
