-- Schede fornitori: anagrafica persistente + codice targa esadecimale (3 char)

create table public.fornitori (
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
  constraint fornitori_codice_targa_hex check (codice_targa ~ '^[0-9A-F]{3}$'),
  constraint fornitori_ragione_sociale_len check (char_length(trim(ragione_sociale)) >= 1),
  constraint fornitori_partita_iva_len check (char_length(trim(partita_iva)) >= 1)
);

comment on table public.fornitori is 'Anagrafica fornitori (Amministrazione → Schede)';
comment on column public.fornitori.codice_targa is 'Identificativo a 3 caratteri esadecimali (0-9A-F)';

create index fornitori_ragione_sociale_idx on public.fornitori (ragione_sociale);
create index fornitori_partita_iva_idx on public.fornitori (partita_iva);
create index fornitori_created_at_idx on public.fornitori (created_at desc);

create trigger fornitori_updated_at
  before update on public.fornitori
  for each row execute function public.set_updated_at();

-- Genera codice targa univoco [0-9A-F]{3}
create or replace function public.generate_codice_targa_fornitore()
returns text
language plpgsql
as $$
declare
  alphabet constant text := '0123456789ABCDEF';
  candidate text;
  i int;
  attempts int := 0;
begin
  loop
    attempts := attempts + 1;
    if attempts > 64 then
      raise exception 'Impossibile generare un codice targa univoco';
    end if;

    candidate := '';
    for i in 1..3 loop
      candidate := candidate || substr(alphabet, 1 + floor(random() * 16)::int, 1);
    end loop;

    exit when not exists (
      select 1 from public.fornitori f where f.codice_targa = candidate
    );
  end loop;

  return candidate;
end;
$$;

create or replace function public.fornitori_set_codice_targa()
returns trigger
language plpgsql
as $$
begin
  if new.codice_targa is null or btrim(new.codice_targa) = '' then
    new.codice_targa := public.generate_codice_targa_fornitore();
  else
    new.codice_targa := upper(btrim(new.codice_targa));
  end if;
  return new;
end;
$$;

create trigger fornitori_codice_targa_bi
  before insert on public.fornitori
  for each row execute function public.fornitori_set_codice_targa();

-- Accesso area amministrazione
create or replace function public.has_area_access(p_slug text)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.get_user_areas(auth.uid()) a
    where a.slug = p_slug
  );
$$;

grant execute on function public.has_area_access(text) to authenticated;
grant execute on function public.generate_codice_targa_fornitore() to authenticated;

alter table public.fornitori enable row level security;

create policy "fornitori_select_amministrazione"
  on public.fornitori for select
  to authenticated
  using (public.has_area_access('amministrazione') or public.is_superadmin());

create policy "fornitori_insert_amministrazione"
  on public.fornitori for insert
  to authenticated
  with check (public.has_area_access('amministrazione') or public.is_superadmin());

create policy "fornitori_update_amministrazione"
  on public.fornitori for update
  to authenticated
  using (public.has_area_access('amministrazione') or public.is_superadmin())
  with check (public.has_area_access('amministrazione') or public.is_superadmin());

grant all on table public.fornitori to postgres, service_role;
grant select, insert, update on table public.fornitori to authenticated;
