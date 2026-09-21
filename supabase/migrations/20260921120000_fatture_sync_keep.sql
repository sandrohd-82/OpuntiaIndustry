-- Keep-sync fatture emesse/ricevute (ISO 9001: audit, soft delete, chi/quando).
-- Impostazione continua + registro immutabile di ogni sessione di sincronizzazione.

create table if not exists public.fatture_sync_keep (
  id uuid primary key default gen_random_uuid(),
  kind text not null check (kind in ('emessa', 'ricevuta')),
  enabled boolean not null default false,
  last_run_at timestamptz,
  last_run_fatture integer not null default 0,
  last_error text,
  created_by uuid references auth.users (id) on delete set null,
  updated_by uuid references auth.users (id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz,
  deleted_by uuid references auth.users (id) on delete set null
);

create unique index if not exists fatture_sync_keep_kind_viva_uidx
  on public.fatture_sync_keep (kind)
  where deleted_at is null;

comment on table public.fatture_sync_keep is
  'Tasto Mantieni sincronizzato: allinea le fatture FiC dall ultima registrata a oggi.';

create table if not exists public.fatture_sync_run (
  id uuid primary key default gen_random_uuid(),
  kind text not null check (kind in ('emessa', 'ricevuta')),
  modalita text not null check (modalita in ('precisa', 'veloce', 'keep')),
  fase text not null check (fase in ('prospettiva', 'retroso', 'mista')),
  stop_month text,
  from_date date,
  to_date date,
  fatture_count integer not null default 0,
  anagrafiche_create jsonb not null default '[]'::jsonb,
  skipped jsonb not null default '[]'::jsonb,
  status text not null default 'completata'
    check (status in ('avviata', 'completata', 'errore', 'interrotta')),
  error text,
  created_by uuid references auth.users (id) on delete set null,
  updated_by uuid references auth.users (id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists fatture_sync_run_kind_created_idx
  on public.fatture_sync_run (kind, created_at desc);

comment on table public.fatture_sync_run is
  'Registro immutabile sessioni sync fatture (resoconto ISO: conteggi e anagrafiche create).';

drop trigger if exists fatture_sync_keep_set_updated_at on public.fatture_sync_keep;
create trigger fatture_sync_keep_set_updated_at
  before update on public.fatture_sync_keep
  for each row execute function public.set_updated_at();

drop trigger if exists fatture_sync_run_set_updated_at on public.fatture_sync_run;
create trigger fatture_sync_run_set_updated_at
  before update on public.fatture_sync_run
  for each row execute function public.set_updated_at();

alter table public.fatture_sync_keep enable row level security;
alter table public.fatture_sync_run enable row level security;

drop policy if exists fatture_sync_keep_select on public.fatture_sync_keep;
create policy fatture_sync_keep_select
  on public.fatture_sync_keep for select to authenticated
  using (public.has_area_access('amministrazione') or public.is_superadmin());

drop policy if exists fatture_sync_keep_insert on public.fatture_sync_keep;
create policy fatture_sync_keep_insert
  on public.fatture_sync_keep for insert to authenticated
  with check (public.has_area_access('amministrazione') or public.is_superadmin());

drop policy if exists fatture_sync_keep_update on public.fatture_sync_keep;
create policy fatture_sync_keep_update
  on public.fatture_sync_keep for update to authenticated
  using (public.has_area_access('amministrazione') or public.is_superadmin())
  with check (public.has_area_access('amministrazione') or public.is_superadmin());

drop policy if exists fatture_sync_run_select on public.fatture_sync_run;
create policy fatture_sync_run_select
  on public.fatture_sync_run for select to authenticated
  using (public.has_area_access('amministrazione') or public.is_superadmin());

drop policy if exists fatture_sync_run_insert on public.fatture_sync_run;
create policy fatture_sync_run_insert
  on public.fatture_sync_run for insert to authenticated
  with check (public.has_area_access('amministrazione') or public.is_superadmin());

drop policy if exists fatture_sync_run_update on public.fatture_sync_run;
create policy fatture_sync_run_update
  on public.fatture_sync_run for update to authenticated
  using (public.has_area_access('amministrazione') or public.is_superadmin())
  with check (public.has_area_access('amministrazione') or public.is_superadmin());

grant select, insert, update on table public.fatture_sync_keep to authenticated;
grant select, insert, update on table public.fatture_sync_run to authenticated;
grant all on table public.fatture_sync_keep to postgres, service_role;
grant all on table public.fatture_sync_run to postgres, service_role;
revoke delete on table public.fatture_sync_keep from authenticated;
revoke delete on table public.fatture_sync_run from authenticated;
