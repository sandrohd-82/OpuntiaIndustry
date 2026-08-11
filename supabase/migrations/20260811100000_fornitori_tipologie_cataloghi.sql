-- Fornitori multi-tipologia (servizio/prodotto/materia_prima) + cataloghi
-- ISO 9001: audit, soft delete sui cataloghi

-- ---------------------------------------------------------------------------
-- Tipologie e collegamenti offerta sul fornitore
-- ---------------------------------------------------------------------------
alter table public.fornitori
  add column if not exists tipologie text[] not null default '{}'::text[],
  add column if not exists servizi_offerti text[] not null default '{}'::text[],
  add column if not exists prodotti_fornitore text[] not null default '{}'::text[];

comment on column public.fornitori.tipologie is
  'Valori ammessi: servizio, prodotto, materia_prima (multi)';
comment on column public.fornitori.servizi_offerti is
  'Codici da catalogo_servizi';
comment on column public.fornitori.prodotti_fornitore is
  'Codici da catalogo_prodotti_fornitore (non prodotti propri)';

-- ---------------------------------------------------------------------------
-- Catalogo servizi
-- ---------------------------------------------------------------------------
create table if not exists public.catalogo_servizi (
  id uuid primary key default gen_random_uuid(),
  codice text not null,
  nome text not null,
  note text not null default '',
  is_bio boolean not null default false,
  created_by uuid references auth.users (id) on delete set null,
  updated_by uuid references auth.users (id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz,
  deleted_by uuid references auth.users (id) on delete set null,
  constraint catalogo_servizi_codice_check check (codice ~* '^sz[A-Za-z0-9\-_\/]+$')
);

create unique index if not exists catalogo_servizi_codice_lower_uidx
  on public.catalogo_servizi (lower(codice))
  where deleted_at is null;

create index if not exists catalogo_servizi_nome_idx
  on public.catalogo_servizi (nome)
  where deleted_at is null;

drop trigger if exists catalogo_servizi_updated_at on public.catalogo_servizi;
create trigger catalogo_servizi_updated_at
  before update on public.catalogo_servizi
  for each row execute function public.set_updated_at();

alter table public.catalogo_servizi enable row level security;

drop policy if exists "catalogo_servizi_select_amm" on public.catalogo_servizi;
create policy "catalogo_servizi_select_amm"
  on public.catalogo_servizi for select to authenticated
  using (public.has_area_access('amministrazione') or public.is_superadmin());

drop policy if exists "catalogo_servizi_insert_amm" on public.catalogo_servizi;
create policy "catalogo_servizi_insert_amm"
  on public.catalogo_servizi for insert to authenticated
  with check (public.has_area_access('amministrazione') or public.is_superadmin());

drop policy if exists "catalogo_servizi_update_amm" on public.catalogo_servizi;
create policy "catalogo_servizi_update_amm"
  on public.catalogo_servizi for update to authenticated
  using (public.has_area_access('amministrazione') or public.is_superadmin())
  with check (public.has_area_access('amministrazione') or public.is_superadmin());

grant select, insert, update on table public.catalogo_servizi to authenticated;
grant all on table public.catalogo_servizi to postgres, service_role;

-- ---------------------------------------------------------------------------
-- Catalogo prodotti fornitore (acquisti, non prodotti propri)
-- ---------------------------------------------------------------------------
create table if not exists public.catalogo_prodotti_fornitore (
  id uuid primary key default gen_random_uuid(),
  codice text not null,
  nome text not null,
  note text not null default '',
  is_bio boolean not null default false,
  created_by uuid references auth.users (id) on delete set null,
  updated_by uuid references auth.users (id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz,
  deleted_by uuid references auth.users (id) on delete set null,
  constraint catalogo_prodotti_fornitore_codice_check check (codice ~* '^pr[A-Za-z0-9\-_\/]+$')
);

create unique index if not exists catalogo_prodotti_fornitore_codice_lower_uidx
  on public.catalogo_prodotti_fornitore (lower(codice))
  where deleted_at is null;

create index if not exists catalogo_prodotti_fornitore_nome_idx
  on public.catalogo_prodotti_fornitore (nome)
  where deleted_at is null;

drop trigger if exists catalogo_prodotti_fornitore_updated_at on public.catalogo_prodotti_fornitore;
create trigger catalogo_prodotti_fornitore_updated_at
  before update on public.catalogo_prodotti_fornitore
  for each row execute function public.set_updated_at();

alter table public.catalogo_prodotti_fornitore enable row level security;

drop policy if exists "catalogo_prodotti_fornitore_select_amm" on public.catalogo_prodotti_fornitore;
create policy "catalogo_prodotti_fornitore_select_amm"
  on public.catalogo_prodotti_fornitore for select to authenticated
  using (public.has_area_access('amministrazione') or public.is_superadmin());

drop policy if exists "catalogo_prodotti_fornitore_insert_amm" on public.catalogo_prodotti_fornitore;
create policy "catalogo_prodotti_fornitore_insert_amm"
  on public.catalogo_prodotti_fornitore for insert to authenticated
  with check (public.has_area_access('amministrazione') or public.is_superadmin());

drop policy if exists "catalogo_prodotti_fornitore_update_amm" on public.catalogo_prodotti_fornitore;
create policy "catalogo_prodotti_fornitore_update_amm"
  on public.catalogo_prodotti_fornitore for update to authenticated
  using (public.has_area_access('amministrazione') or public.is_superadmin())
  with check (public.has_area_access('amministrazione') or public.is_superadmin());

grant select, insert, update on table public.catalogo_prodotti_fornitore to authenticated;
grant all on table public.catalogo_prodotti_fornitore to postgres, service_role;
