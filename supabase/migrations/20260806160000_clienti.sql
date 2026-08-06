-- Schede clienti: stessa struttura dei fornitori, targa C001–CFFF

create table public.clienti (
  id uuid primary key default gen_random_uuid(),
  codice_targa text not null unique,
  ragione_sociale text not null,
  partita_iva text not null,
  sede_amm_nazione text not null,
  sede_amm_provincia text not null,
  sede_amm_citta text not null,
  sede_amm_cap text not null,
  sede_amm_indirizzo text not null,
  sede_mag_nazione text not null,
  sede_mag_provincia text not null,
  sede_mag_citta text not null,
  sede_mag_cap text not null,
  sede_mag_indirizzo text not null,
  prodotti_acquistati text[] not null default '{}',
  created_by uuid references auth.users (id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint clienti_codice_targa_hex
    check (codice_targa ~ '^C[0-9A-F]{3}$' and codice_targa <> 'C000'),
  constraint clienti_ragione_sociale_len check (char_length(trim(ragione_sociale)) >= 1),
  constraint clienti_partita_iva_len check (char_length(trim(partita_iva)) >= 1)
);

comment on table public.clienti is 'Anagrafica clienti (Amministrazione → Schede)';
comment on column public.clienti.codice_targa is
  'Targa cliente: C + 3 esadecimali (C001–CFFF), assegnata al salvataggio';

create index clienti_ragione_sociale_idx on public.clienti (ragione_sociale);
create index clienti_partita_iva_idx on public.clienti (partita_iva);
create index clienti_created_at_idx on public.clienti (created_at desc);

create trigger clienti_updated_at
  before update on public.clienti
  for each row execute function public.set_updated_at();

create or replace function public.generate_codice_targa_cliente()
returns text
language plpgsql
as $$
declare
  alphabet constant text := '0123456789ABCDEF';
  idx int;
  body text;
  candidate text;
  n int;
  digit int;
  i int;
begin
  for idx in 1..4095 loop
    n := idx;
    body := '';
    for i in 1..3 loop
      digit := n % 16;
      body := substr(alphabet, digit + 1, 1) || body;
      n := n / 16;
    end loop;

    candidate := 'C' || body;

    if not exists (
      select 1 from public.clienti c where c.codice_targa = candidate
    ) then
      return candidate;
    end if;
  end loop;

  raise exception 'Impossibile generare un codice targa cliente univoco';
end;
$$;

create or replace function public.clienti_set_codice_targa()
returns trigger
language plpgsql
as $$
begin
  if new.codice_targa is null or btrim(new.codice_targa) = '' then
    new.codice_targa := public.generate_codice_targa_cliente();
  else
    new.codice_targa := upper(btrim(new.codice_targa));
  end if;
  return new;
end;
$$;

create trigger clienti_codice_targa_bi
  before insert on public.clienti
  for each row execute function public.clienti_set_codice_targa();

alter table public.clienti enable row level security;

create policy "clienti_select_amministrazione"
  on public.clienti for select
  to authenticated
  using (public.has_area_access('amministrazione') or public.is_superadmin());

create policy "clienti_insert_amministrazione"
  on public.clienti for insert
  to authenticated
  with check (public.has_area_access('amministrazione') or public.is_superadmin());

create policy "clienti_update_amministrazione"
  on public.clienti for update
  to authenticated
  using (public.has_area_access('amministrazione') or public.is_superadmin())
  with check (public.has_area_access('amministrazione') or public.is_superadmin());

grant all on table public.clienti to postgres, service_role;
grant select, insert, update on table public.clienti to authenticated;
grant execute on function public.generate_codice_targa_cliente() to authenticated;
