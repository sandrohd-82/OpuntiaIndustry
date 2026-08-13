-- Catalogo Attività (targa At-…) e collegamento ai prodotti Agrinsicilia
-- Usato nel calendario consegna: giorni oltre la lavorazione (ISO 9001).

create table if not exists public.attivita (
  id uuid primary key default gen_random_uuid(),
  codice text not null,
  titolo text not null,
  spiegazione text not null default '',
  kg_per_ora numeric(12, 3) not null default 90
    check (kg_per_ora > 0),
  ore_giorno numeric(6, 2) not null default 8
    check (ore_giorno > 0 and ore_giorno <= 24),
  incastrabile_durante_lavorazione boolean not null default false,
  documento_stato text not null default 'approvato'
    check (documento_stato in ('bozza', 'approvato', 'chiuso')),
  versione integer not null default 1 check (versione >= 1),
  created_by uuid references auth.users (id) on delete set null,
  updated_by uuid references auth.users (id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz,
  deleted_by uuid references auth.users (id) on delete set null,
  constraint attivita_codice_at_check check (codice ~ '^At[A-Za-z0-9\-_\/]+$')
);

create unique index if not exists attivita_codice_uidx
  on public.attivita (lower(codice))
  where deleted_at is null;

comment on table public.attivita is
  'Catalogo attività post/durante lavorazione (targa At). Schede → Attività.';

drop trigger if exists attivita_updated_at on public.attivita;
create trigger attivita_updated_at
  before update on public.attivita
  for each row execute function public.set_updated_at();

alter table public.attivita enable row level security;
drop policy if exists "attivita_all" on public.attivita;
create policy "attivita_all"
  on public.attivita for all to authenticated
  using (public.has_area_access('amministrazione') or public.is_superadmin())
  with check (public.has_area_access('amministrazione') or public.is_superadmin());

grant select, insert, update on table public.attivita to authenticated;
grant all on table public.attivita to postgres, service_role;
revoke delete on table public.attivita from authenticated;

-- Junction prodotto ↔ attività (ordine di esecuzione)
create table if not exists public.prodotti_propri_attivita (
  id uuid primary key default gen_random_uuid(),
  prodotto_id uuid not null references public.prodotti_propri (id) on delete cascade,
  attivita_id uuid not null references public.attivita (id) on delete restrict,
  sort_order integer not null default 0,
  created_by uuid references auth.users (id) on delete set null,
  updated_by uuid references auth.users (id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz,
  deleted_by uuid references auth.users (id) on delete set null
);

create unique index if not exists prodotti_propri_attivita_uidx
  on public.prodotti_propri_attivita (prodotto_id, attivita_id)
  where deleted_at is null;

create index if not exists prodotti_propri_attivita_prodotto_idx
  on public.prodotti_propri_attivita (prodotto_id)
  where deleted_at is null;

comment on table public.prodotti_propri_attivita is
  'Attività oltre la lavorazione associate a un prodotto Agrinsicilia';

drop trigger if exists prodotti_propri_attivita_updated_at
  on public.prodotti_propri_attivita;
create trigger prodotti_propri_attivita_updated_at
  before update on public.prodotti_propri_attivita
  for each row execute function public.set_updated_at();

alter table public.prodotti_propri_attivita enable row level security;
drop policy if exists "prodotti_propri_attivita_all"
  on public.prodotti_propri_attivita;
create policy "prodotti_propri_attivita_all"
  on public.prodotti_propri_attivita for all to authenticated
  using (public.has_area_access('amministrazione') or public.is_superadmin())
  with check (public.has_area_access('amministrazione') or public.is_superadmin());

grant select, insert, update on table public.prodotti_propri_attivita
  to authenticated;
grant all on table public.prodotti_propri_attivita
  to postgres, service_role;
revoke delete on table public.prodotti_propri_attivita from authenticated;

-- Seed attività tipica (idempotente)
insert into public.attivita (
  codice, titolo, spiegazione, kg_per_ora, ore_giorno,
  incastrabile_durante_lavorazione, documento_stato, versione
)
select
  'At-Prep/Imb',
  'Preparazione e imballaggio',
  'Attività di preparazione e imballaggio dopo la lavorazione del prodotto.',
  90,
  8,
  false,
  'approvato',
  1
where not exists (
  select 1 from public.attivita
  where lower(codice) = lower('At-Prep/Imb') and deleted_at is null
);
