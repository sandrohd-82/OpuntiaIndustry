-- Produzione Opzione A: processi + attività di processo (cataloghi ISO 9001)
-- Attività riusabili; processi con composizione ordinata N:M.
-- Separate dal catalogo Attività Amministrazione (At-*).

-- ---------------------------------------------------------------------------
-- Catalogo attività di processo (blocchi di esecuzione riusabili)
-- ---------------------------------------------------------------------------
create table if not exists public.produzione_processo_attivita (
  id uuid primary key default gen_random_uuid(),
  codice text not null,
  nome text not null,
  descrizione text not null default '',
  attivo boolean not null default true,
  note text not null default '',
  created_by uuid references auth.users (id) on delete set null,
  updated_by uuid references auth.users (id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz,
  deleted_by uuid references auth.users (id) on delete set null
);

create unique index if not exists produzione_processo_attivita_codice_lower_uidx
  on public.produzione_processo_attivita (lower(codice))
  where deleted_at is null;

comment on table public.produzione_processo_attivita is
  'Attività di processo produttivo (ISO 9001) — blocchi riusabili (es. pesare, scarico essiccatore).';

drop trigger if exists produzione_processo_attivita_updated_at
  on public.produzione_processo_attivita;
create trigger produzione_processo_attivita_updated_at
  before update on public.produzione_processo_attivita
  for each row execute function public.set_updated_at();

alter table public.produzione_processo_attivita enable row level security;
drop policy if exists "produzione_processo_attivita_all"
  on public.produzione_processo_attivita;
create policy "produzione_processo_attivita_all"
  on public.produzione_processo_attivita for all to authenticated
  using (
    public.has_area_access('produzione')
    or public.has_area_access('amministrazione')
    or public.is_superadmin()
  )
  with check (
    public.has_area_access('produzione')
    or public.has_area_access('amministrazione')
    or public.is_superadmin()
  );
grant select, insert, update on table public.produzione_processo_attivita to authenticated;
grant all on table public.produzione_processo_attivita to postgres, service_role;
revoke delete on table public.produzione_processo_attivita from authenticated;

-- ---------------------------------------------------------------------------
-- Catalogo processi (documento controllato: versione + stato + approvazione)
-- ---------------------------------------------------------------------------
create table if not exists public.produzione_processi (
  id uuid primary key default gen_random_uuid(),
  codice text not null,
  nome text not null,
  descrizione text not null default '',
  attivo boolean not null default true,
  note text not null default '',
  versione integer not null default 1,
  documento_stato text not null default 'bozza'
    check (documento_stato in ('bozza', 'approvato', 'chiuso')),
  approvato_at timestamptz,
  approvato_by uuid references auth.users (id) on delete set null,
  created_by uuid references auth.users (id) on delete set null,
  updated_by uuid references auth.users (id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz,
  deleted_by uuid references auth.users (id) on delete set null
);

create unique index if not exists produzione_processi_codice_lower_uidx
  on public.produzione_processi (lower(codice))
  where deleted_at is null;

comment on table public.produzione_processi is
  'Processi produttivi (ISO 9001) — ricette ordinate di attività (es. Essiccazione).';

drop trigger if exists produzione_processi_updated_at on public.produzione_processi;
create trigger produzione_processi_updated_at
  before update on public.produzione_processi
  for each row execute function public.set_updated_at();

alter table public.produzione_processi enable row level security;
drop policy if exists "produzione_processi_all" on public.produzione_processi;
create policy "produzione_processi_all"
  on public.produzione_processi for all to authenticated
  using (
    public.has_area_access('produzione')
    or public.has_area_access('amministrazione')
    or public.is_superadmin()
  )
  with check (
    public.has_area_access('produzione')
    or public.has_area_access('amministrazione')
    or public.is_superadmin()
  );
grant select, insert, update on table public.produzione_processi to authenticated;
grant all on table public.produzione_processi to postgres, service_role;
revoke delete on table public.produzione_processi from authenticated;

-- ---------------------------------------------------------------------------
-- Composizione: processo ↔ attività (ordine + obbligatorietà)
-- ---------------------------------------------------------------------------
create table if not exists public.produzione_processo_passi (
  id uuid primary key default gen_random_uuid(),
  processo_id uuid not null
    references public.produzione_processi (id) on delete restrict,
  attivita_id uuid not null
    references public.produzione_processo_attivita (id) on delete restrict,
  sort_order integer not null default 0,
  obbligatorio boolean not null default true,
  note text not null default '',
  created_by uuid references auth.users (id) on delete set null,
  updated_by uuid references auth.users (id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz,
  deleted_by uuid references auth.users (id) on delete set null
);

create unique index if not exists produzione_processo_passi_open_uidx
  on public.produzione_processo_passi (processo_id, attivita_id)
  where deleted_at is null;

create index if not exists produzione_processo_passi_processo_idx
  on public.produzione_processo_passi (processo_id, sort_order)
  where deleted_at is null;

create index if not exists produzione_processo_passi_attivita_idx
  on public.produzione_processo_passi (attivita_id)
  where deleted_at is null;

comment on table public.produzione_processo_passi is
  'Passi ordinati di un processo (ISO 9001) — composizione N:M processo↔attività.';

drop trigger if exists produzione_processo_passi_updated_at
  on public.produzione_processo_passi;
create trigger produzione_processo_passi_updated_at
  before update on public.produzione_processo_passi
  for each row execute function public.set_updated_at();

alter table public.produzione_processo_passi enable row level security;
drop policy if exists "produzione_processo_passi_all"
  on public.produzione_processo_passi;
create policy "produzione_processo_passi_all"
  on public.produzione_processo_passi for all to authenticated
  using (
    public.has_area_access('produzione')
    or public.has_area_access('amministrazione')
    or public.is_superadmin()
  )
  with check (
    public.has_area_access('produzione')
    or public.has_area_access('amministrazione')
    or public.is_superadmin()
  );
grant select, insert, update on table public.produzione_processo_passi to authenticated;
grant all on table public.produzione_processo_passi to postgres, service_role;
revoke delete on table public.produzione_processo_passi from authenticated;
