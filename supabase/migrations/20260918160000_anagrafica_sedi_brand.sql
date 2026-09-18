-- ISO 9001 8.5.2 / 7.5: sedi tipizzate e brand per cliente / possibile cliente.
-- Soft delete + audit. Le colonne sede_amm_* / sede_mag_* restano per compatibilità.

do $$
begin
  if not exists (
    select 1 from pg_type t
    join pg_namespace n on n.oid = t.typnamespace
    where n.nspname = 'public' and t.typname = 'anagrafica_sede_tipo'
  ) then
    create type public.anagrafica_sede_tipo as enum (
      'amministrativa',
      'magazzino',
      'produttiva',
      'legale'
    );
  end if;
end $$;

create table if not exists public.anagrafica_sedi (
  id uuid primary key default gen_random_uuid(),
  owner_kind text not null check (owner_kind in ('cliente', 'cliente_possibile')),
  owner_id uuid not null,
  tipo public.anagrafica_sede_tipo not null,
  nazione text not null default '',
  provincia text not null default '',
  citta text not null default '',
  cap text not null default '',
  indirizzo text not null default '',
  sort_order integer not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  created_by uuid,
  updated_by uuid,
  deleted_at timestamptz,
  deleted_by uuid
);

create index if not exists anagrafica_sedi_owner_idx
  on public.anagrafica_sedi (owner_kind, owner_id)
  where deleted_at is null;

create table if not exists public.anagrafica_brand (
  id uuid primary key default gen_random_uuid(),
  owner_kind text not null check (owner_kind in ('cliente', 'cliente_possibile')),
  owner_id uuid not null,
  nome text not null,
  sito_web text not null default '',
  email text not null default '',
  telefono text not null default '',
  referente_nome text not null default '',
  referente_contatto_id uuid,
  logo_path text not null default '',
  sort_order integer not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  created_by uuid,
  updated_by uuid,
  deleted_at timestamptz,
  deleted_by uuid
);

create index if not exists anagrafica_brand_owner_idx
  on public.anagrafica_brand (owner_kind, owner_id)
  where deleted_at is null;

alter table public.anagrafica_sedi enable row level security;
alter table public.anagrafica_brand enable row level security;

drop policy if exists "anagrafica_sedi_select" on public.anagrafica_sedi;
create policy "anagrafica_sedi_select" on public.anagrafica_sedi
  for select to authenticated
  using (
    public.is_superadmin()
    or public.has_area_access('amministrazione')
    or public.has_area_access('commerciale')
    or public.has_area_access('webmail')
  );

drop policy if exists "anagrafica_sedi_insert" on public.anagrafica_sedi;
create policy "anagrafica_sedi_insert" on public.anagrafica_sedi
  for insert to authenticated
  with check (
    public.is_superadmin()
    or public.has_area_access('amministrazione')
    or public.has_area_access('commerciale')
    or public.has_area_access('webmail')
  );

drop policy if exists "anagrafica_sedi_update" on public.anagrafica_sedi;
create policy "anagrafica_sedi_update" on public.anagrafica_sedi
  for update to authenticated
  using (
    public.is_superadmin()
    or public.has_area_access('amministrazione')
    or public.has_area_access('commerciale')
    or public.has_area_access('webmail')
  )
  with check (
    public.is_superadmin()
    or public.has_area_access('amministrazione')
    or public.has_area_access('commerciale')
    or public.has_area_access('webmail')
  );

drop policy if exists "anagrafica_brand_select" on public.anagrafica_brand;
create policy "anagrafica_brand_select" on public.anagrafica_brand
  for select to authenticated
  using (
    public.is_superadmin()
    or public.has_area_access('amministrazione')
    or public.has_area_access('commerciale')
    or public.has_area_access('webmail')
  );

drop policy if exists "anagrafica_brand_insert" on public.anagrafica_brand;
create policy "anagrafica_brand_insert" on public.anagrafica_brand
  for insert to authenticated
  with check (
    public.is_superadmin()
    or public.has_area_access('amministrazione')
    or public.has_area_access('commerciale')
    or public.has_area_access('webmail')
  );

drop policy if exists "anagrafica_brand_update" on public.anagrafica_brand;
create policy "anagrafica_brand_update" on public.anagrafica_brand
  for update to authenticated
  using (
    public.is_superadmin()
    or public.has_area_access('amministrazione')
    or public.has_area_access('commerciale')
    or public.has_area_access('webmail')
  )
  with check (
    public.is_superadmin()
    or public.has_area_access('amministrazione')
    or public.has_area_access('commerciale')
    or public.has_area_access('webmail')
  );

grant select, insert, update on public.anagrafica_sedi to authenticated;
grant select, insert, update on public.anagrafica_brand to authenticated;

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'anagrafica-brand-loghi',
  'anagrafica-brand-loghi',
  false,
  5242880,
  array['image/jpeg', 'image/png', 'image/webp']::text[]
)
on conflict (id) do update set
  file_size_limit = excluded.file_size_limit,
  allowed_mime_types = excluded.allowed_mime_types;

drop policy if exists "anagrafica_brand_loghi_select" on storage.objects;
create policy "anagrafica_brand_loghi_select"
  on storage.objects for select
  to authenticated
  using (
    bucket_id = 'anagrafica-brand-loghi'
    and (
      public.is_superadmin()
      or public.has_area_access('amministrazione')
      or public.has_area_access('commerciale')
    )
  );

drop policy if exists "anagrafica_brand_loghi_insert" on storage.objects;
create policy "anagrafica_brand_loghi_insert"
  on storage.objects for insert
  to authenticated
  with check (
    bucket_id = 'anagrafica-brand-loghi'
    and (
      public.is_superadmin()
      or public.has_area_access('amministrazione')
      or public.has_area_access('commerciale')
    )
  );

drop policy if exists "anagrafica_brand_loghi_update" on storage.objects;
create policy "anagrafica_brand_loghi_update"
  on storage.objects for update
  to authenticated
  using (
    bucket_id = 'anagrafica-brand-loghi'
    and (
      public.is_superadmin()
      or public.has_area_access('amministrazione')
      or public.has_area_access('commerciale')
    )
  )
  with check (
    bucket_id = 'anagrafica-brand-loghi'
    and (
      public.is_superadmin()
      or public.has_area_access('amministrazione')
      or public.has_area_access('commerciale')
    )
  );

drop policy if exists "anagrafica_brand_loghi_delete" on storage.objects;
create policy "anagrafica_brand_loghi_delete"
  on storage.objects for delete
  to authenticated
  using (
    bucket_id = 'anagrafica-brand-loghi'
    and (
      public.is_superadmin()
      or public.has_area_access('amministrazione')
      or public.has_area_access('commerciale')
    )
  );

insert into public.anagrafica_sedi (
  owner_kind, owner_id, tipo, nazione, provincia, citta, cap, indirizzo, sort_order, created_by, updated_by
)
select
  'cliente',
  c.id,
  'amministrativa',
  coalesce(c.sede_amm_nazione, ''),
  coalesce(c.sede_amm_provincia, ''),
  coalesce(c.sede_amm_citta, ''),
  coalesce(c.sede_amm_cap, ''),
  coalesce(c.sede_amm_indirizzo, ''),
  0,
  c.created_by,
  c.updated_by
from public.clienti c
where c.deleted_at is null
  and (
    coalesce(c.sede_amm_nazione, '') <> ''
    or coalesce(c.sede_amm_provincia, '') <> ''
    or coalesce(c.sede_amm_citta, '') <> ''
    or coalesce(c.sede_amm_cap, '') <> ''
    or coalesce(c.sede_amm_indirizzo, '') <> ''
  )
  and not exists (
    select 1 from public.anagrafica_sedi s
    where s.owner_kind = 'cliente'
      and s.owner_id = c.id
      and s.tipo = 'amministrativa'
      and s.deleted_at is null
  );

insert into public.anagrafica_sedi (
  owner_kind, owner_id, tipo, nazione, provincia, citta, cap, indirizzo, sort_order, created_by, updated_by
)
select
  'cliente',
  c.id,
  'magazzino',
  coalesce(c.sede_mag_nazione, ''),
  coalesce(c.sede_mag_provincia, ''),
  coalesce(c.sede_mag_citta, ''),
  coalesce(c.sede_mag_cap, ''),
  coalesce(c.sede_mag_indirizzo, ''),
  1,
  c.created_by,
  c.updated_by
from public.clienti c
where c.deleted_at is null
  and (
    coalesce(c.sede_mag_nazione, '') <> ''
    or coalesce(c.sede_mag_provincia, '') <> ''
    or coalesce(c.sede_mag_citta, '') <> ''
    or coalesce(c.sede_mag_cap, '') <> ''
    or coalesce(c.sede_mag_indirizzo, '') <> ''
  )
  and not exists (
    select 1 from public.anagrafica_sedi s
    where s.owner_kind = 'cliente'
      and s.owner_id = c.id
      and s.tipo = 'magazzino'
      and s.deleted_at is null
  );

insert into public.anagrafica_sedi (
  owner_kind, owner_id, tipo, nazione, provincia, citta, cap, indirizzo, sort_order, created_by, updated_by
)
select
  'cliente_possibile',
  c.id,
  'amministrativa',
  coalesce(c.sede_amm_nazione, ''),
  coalesce(c.sede_amm_provincia, ''),
  coalesce(c.sede_amm_citta, ''),
  coalesce(c.sede_amm_cap, ''),
  coalesce(c.sede_amm_indirizzo, ''),
  0,
  c.created_by,
  c.updated_by
from public.clienti_possibili c
where c.deleted_at is null
  and (
    coalesce(c.sede_amm_nazione, '') <> ''
    or coalesce(c.sede_amm_provincia, '') <> ''
    or coalesce(c.sede_amm_citta, '') <> ''
    or coalesce(c.sede_amm_cap, '') <> ''
    or coalesce(c.sede_amm_indirizzo, '') <> ''
  )
  and not exists (
    select 1 from public.anagrafica_sedi s
    where s.owner_kind = 'cliente_possibile'
      and s.owner_id = c.id
      and s.tipo = 'amministrativa'
      and s.deleted_at is null
  );

insert into public.anagrafica_sedi (
  owner_kind, owner_id, tipo, nazione, provincia, citta, cap, indirizzo, sort_order, created_by, updated_by
)
select
  'cliente_possibile',
  c.id,
  'magazzino',
  coalesce(c.sede_mag_nazione, ''),
  coalesce(c.sede_mag_provincia, ''),
  coalesce(c.sede_mag_citta, ''),
  coalesce(c.sede_mag_cap, ''),
  coalesce(c.sede_mag_indirizzo, ''),
  1,
  c.created_by,
  c.updated_by
from public.clienti_possibili c
where c.deleted_at is null
  and (
    coalesce(c.sede_mag_nazione, '') <> ''
    or coalesce(c.sede_mag_provincia, '') <> ''
    or coalesce(c.sede_mag_citta, '') <> ''
    or coalesce(c.sede_mag_cap, '') <> ''
    or coalesce(c.sede_mag_indirizzo, '') <> ''
  )
  and not exists (
    select 1 from public.anagrafica_sedi s
    where s.owner_kind = 'cliente_possibile'
      and s.owner_id = c.id
      and s.tipo = 'magazzino'
      and s.deleted_at is null
  );
