-- Checkpoint sync anagrafiche FiC (Pausa → ripresa) — ISO 9001 tracciabilità

create table if not exists public.fic_import_checkpoints (
  entity_kind text primary key,
  status text not null default 'idle',
  completed_fic_ids bigint[] not null default '{}'::bigint[],
  last_saved_fic_entity_id bigint,
  last_saved_name text not null default '',
  last_saved_vat text not null default '',
  updated_by uuid references auth.users (id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint fic_import_checkpoints_kind_check check (
    entity_kind in ('supplier', 'client')
  ),
  constraint fic_import_checkpoints_status_check check (
    status in ('idle', 'in_progress', 'paused')
  )
);

comment on table public.fic_import_checkpoints is
  'Stato sync anagrafiche FiC: consente Pausa e ripresa senza ripartire da zero';
comment on column public.fic_import_checkpoints.completed_fic_ids is
  'ID FiC già salvati o scartati in questa sessione di sync';

drop trigger if exists fic_import_checkpoints_updated_at on public.fic_import_checkpoints;
create trigger fic_import_checkpoints_updated_at
  before update on public.fic_import_checkpoints
  for each row execute function public.set_updated_at();

alter table public.fic_import_checkpoints enable row level security;

drop policy if exists "fic_import_checkpoints_select_amm" on public.fic_import_checkpoints;
create policy "fic_import_checkpoints_select_amm"
  on public.fic_import_checkpoints for select
  to authenticated
  using (public.has_area_access('amministrazione') or public.is_superadmin());

drop policy if exists "fic_import_checkpoints_insert_amm" on public.fic_import_checkpoints;
create policy "fic_import_checkpoints_insert_amm"
  on public.fic_import_checkpoints for insert
  to authenticated
  with check (public.has_area_access('amministrazione') or public.is_superadmin());

drop policy if exists "fic_import_checkpoints_update_amm" on public.fic_import_checkpoints;
create policy "fic_import_checkpoints_update_amm"
  on public.fic_import_checkpoints for update
  to authenticated
  using (public.has_area_access('amministrazione') or public.is_superadmin())
  with check (public.has_area_access('amministrazione') or public.is_superadmin());

grant select, insert, update on table public.fic_import_checkpoints to authenticated;
grant all on table public.fic_import_checkpoints to postgres, service_role;
