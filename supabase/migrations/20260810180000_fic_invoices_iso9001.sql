-- Fatture in Cloud cache locale (ISO 9001): sync differenziale + soft delete + log sync

-- ---------------------------------------------------------------------------
-- fic_invoices
-- ---------------------------------------------------------------------------
create table if not exists public.fic_invoices (
  id uuid primary key default gen_random_uuid(),
  fic_id bigint not null,
  type text not null,
  number text not null default '',
  entity_name text not null default '',
  entity_vat text not null default '',
  amount_gross numeric(14, 2) not null default 0,
  date date,
  due_date date,
  status text not null default 'not_paid',
  raw_data jsonb not null default '{}'::jsonb,
  last_synced_at timestamptz not null default now(),
  created_by uuid references auth.users (id) on delete set null,
  updated_by uuid references auth.users (id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz,
  deleted_by uuid references auth.users (id) on delete set null,
  constraint fic_invoices_type_check check (type in ('issued', 'received')),
  constraint fic_invoices_status_check check (
    status in ('paid', 'not_paid', 'partially_paid')
  )
);

comment on table public.fic_invoices is
  'Cache locale fatture FiC (emesse/ricevute) — offline-first ISO 9001';
comment on column public.fic_invoices.fic_id is
  'ID documento su Fatture in Cloud';
comment on column public.fic_invoices.type is
  'issued = emessa | received = ricevuta';
comment on column public.fic_invoices.raw_data is
  'Payload originale FiC (tracciabilità)';
comment on column public.fic_invoices.deleted_at is
  'Soft delete ISO: mai cancellazione fisica';

create unique index if not exists fic_invoices_fic_id_type_uidx
  on public.fic_invoices (fic_id, type);

create index if not exists fic_invoices_type_date_idx
  on public.fic_invoices (type, date desc nulls last)
  where deleted_at is null;

create index if not exists fic_invoices_status_idx
  on public.fic_invoices (status)
  where deleted_at is null;

create index if not exists fic_invoices_last_synced_idx
  on public.fic_invoices (last_synced_at desc);

drop trigger if exists fic_invoices_updated_at on public.fic_invoices;
create trigger fic_invoices_updated_at
  before update on public.fic_invoices
  for each row execute function public.set_updated_at();

alter table public.fic_invoices enable row level security;

drop policy if exists "fic_invoices_select_amministrazione" on public.fic_invoices;
create policy "fic_invoices_select_amministrazione"
  on public.fic_invoices for select
  to authenticated
  using (public.has_area_access('amministrazione') or public.is_superadmin());

drop policy if exists "fic_invoices_insert_amministrazione" on public.fic_invoices;
create policy "fic_invoices_insert_amministrazione"
  on public.fic_invoices for insert
  to authenticated
  with check (public.has_area_access('amministrazione') or public.is_superadmin());

drop policy if exists "fic_invoices_update_amministrazione" on public.fic_invoices;
create policy "fic_invoices_update_amministrazione"
  on public.fic_invoices for update
  to authenticated
  using (public.has_area_access('amministrazione') or public.is_superadmin())
  with check (public.has_area_access('amministrazione') or public.is_superadmin());

grant select, insert, update on table public.fic_invoices to authenticated;
grant all on table public.fic_invoices to postgres, service_role;

-- ---------------------------------------------------------------------------
-- fic_sync_logs (immutabile: solo INSERT)
-- ---------------------------------------------------------------------------
create table if not exists public.fic_sync_logs (
  id uuid primary key default gen_random_uuid(),
  started_at timestamptz not null default now(),
  finished_at timestamptz,
  status text not null default 'running',
  documents_fetched integer not null default 0,
  documents_upserted integer not null default 0,
  since_at timestamptz,
  error_message text not null default '',
  details jsonb not null default '{}'::jsonb,
  created_by uuid references auth.users (id) on delete set null,
  created_at timestamptz not null default now(),
  constraint fic_sync_logs_status_check check (
    status in ('running', 'success', 'error')
  )
);

comment on table public.fic_sync_logs is
  'Registro sincronizzazioni FiC (immutabile) — ISO 9001 §8.5.2';

create index if not exists fic_sync_logs_created_at_idx
  on public.fic_sync_logs (created_at desc);

create index if not exists fic_sync_logs_status_idx
  on public.fic_sync_logs (status, created_at desc);

alter table public.fic_sync_logs enable row level security;

drop policy if exists "fic_sync_logs_select_amministrazione" on public.fic_sync_logs;
create policy "fic_sync_logs_select_amministrazione"
  on public.fic_sync_logs for select
  to authenticated
  using (public.has_area_access('amministrazione') or public.is_superadmin());

drop policy if exists "fic_sync_logs_insert_amministrazione" on public.fic_sync_logs;
create policy "fic_sync_logs_insert_amministrazione"
  on public.fic_sync_logs for insert
  to authenticated
  with check (public.has_area_access('amministrazione') or public.is_superadmin());

-- UPDATE solo per chiudere un sync (running → success/error). Nessun DELETE.
drop policy if exists "fic_sync_logs_update_amministrazione" on public.fic_sync_logs;
create policy "fic_sync_logs_update_amministrazione"
  on public.fic_sync_logs for update
  to authenticated
  using (public.has_area_access('amministrazione') or public.is_superadmin())
  with check (public.has_area_access('amministrazione') or public.is_superadmin());

grant select, insert, update on table public.fic_sync_logs to authenticated;
grant all on table public.fic_sync_logs to postgres, service_role;
