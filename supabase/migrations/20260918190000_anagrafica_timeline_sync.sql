-- Sync continua scheda ↔ gestionale (mail, PN, documenti). Default ON.
-- Pausa solo Super Admin, con audit. Soft delete, niente delete fisico.

create table if not exists public.anagrafica_timeline_sync (
  id uuid primary key default gen_random_uuid(),
  azienda_tipo text not null check (
    azienda_tipo in ('cliente', 'fornitore', 'cliente_possibile')
  ),
  azienda_id uuid not null,
  attiva boolean not null default true,
  paused_at timestamptz,
  paused_by uuid references auth.users (id) on delete set null,
  pause_motivo text not null default '',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  created_by uuid references auth.users (id) on delete set null,
  updated_by uuid references auth.users (id) on delete set null,
  deleted_at timestamptz,
  deleted_by uuid references auth.users (id) on delete set null
);

create unique index if not exists anagrafica_timeline_sync_open_uidx
  on public.anagrafica_timeline_sync (azienda_tipo, azienda_id)
  where deleted_at is null;

drop trigger if exists anagrafica_timeline_sync_updated_at
  on public.anagrafica_timeline_sync;
create trigger anagrafica_timeline_sync_updated_at
  before update on public.anagrafica_timeline_sync
  for each row execute function public.set_updated_at();

comment on table public.anagrafica_timeline_sync is
  'Stato Mantieni sincronizzato per scheda. Assenza riga = attivo.';

alter table public.anagrafica_timeline_sync enable row level security;

drop policy if exists "anagrafica_timeline_sync_select" on public.anagrafica_timeline_sync;
create policy "anagrafica_timeline_sync_select"
  on public.anagrafica_timeline_sync for select
  to authenticated
  using (deleted_at is null);

drop policy if exists "anagrafica_timeline_sync_write" on public.anagrafica_timeline_sync;
create policy "anagrafica_timeline_sync_write"
  on public.anagrafica_timeline_sync for insert
  to authenticated
  with check (true);

drop policy if exists "anagrafica_timeline_sync_update" on public.anagrafica_timeline_sync;
create policy "anagrafica_timeline_sync_update"
  on public.anagrafica_timeline_sync for update
  to authenticated
  using (true)
  with check (true);

grant select, insert, update on table public.anagrafica_timeline_sync to authenticated;
grant all on table public.anagrafica_timeline_sync to postgres, service_role;
revoke delete on table public.anagrafica_timeline_sync from authenticated;
