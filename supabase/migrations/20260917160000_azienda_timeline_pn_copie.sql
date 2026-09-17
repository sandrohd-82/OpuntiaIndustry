-- Copie in timeline azienda di Note / Attività / Promemoria già creati.
-- Non sono nuovi record operativi Pn: solo facsimile per la timeline (ISO 9001 §8.5.2).

create table if not exists public.azienda_timeline_pn_copie (
  id uuid primary key default gen_random_uuid(),
  azienda_tipo text not null
    check (azienda_tipo in ('cliente', 'fornitore', 'cliente_possibile')),
  azienda_id uuid not null,
  origine_tipo text not null
    check (origine_tipo in ('nota', 'attivita', 'promemoria')),
  origine_id uuid not null,
  occurred_at timestamptz not null,
  titolo text not null default '',
  testo text not null default '',
  versione int not null default 1,
  documento_stato text not null default 'approvato'
    check (documento_stato in ('bozza', 'approvato', 'chiuso')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  created_by uuid references auth.users (id) on delete set null,
  updated_by uuid references auth.users (id) on delete set null,
  deleted_at timestamptz,
  deleted_by uuid references auth.users (id) on delete set null
);

create unique index if not exists az_tl_pn_copie_open_uidx
  on public.azienda_timeline_pn_copie (
    azienda_tipo,
    azienda_id,
    origine_tipo,
    origine_id
  )
  where deleted_at is null;

create index if not exists az_tl_pn_copie_azienda_idx
  on public.azienda_timeline_pn_copie (azienda_tipo, azienda_id, occurred_at)
  where deleted_at is null;

drop trigger if exists az_tl_pn_copie_updated_at on public.azienda_timeline_pn_copie;
create trigger az_tl_pn_copie_updated_at
  before update on public.azienda_timeline_pn_copie
  for each row execute function public.set_updated_at();

comment on table public.azienda_timeline_pn_copie is
  'Facsimile in timeline di nota/attività/promemoria Pn — non è un nuovo record operativo.';

alter table public.azienda_timeline_pn_copie enable row level security;

drop policy if exists "az_tl_pn_copie_select" on public.azienda_timeline_pn_copie;
create policy "az_tl_pn_copie_select"
  on public.azienda_timeline_pn_copie for select
  to authenticated
  using (
    public.is_superadmin()
    or public.has_area_access('amministrazione')
    or public.has_area_access('promemorie-e-note')
  );

drop policy if exists "az_tl_pn_copie_write" on public.azienda_timeline_pn_copie;
create policy "az_tl_pn_copie_write"
  on public.azienda_timeline_pn_copie for insert
  to authenticated
  with check (
    public.is_superadmin()
    or public.has_area_access('amministrazione')
    or public.has_area_access('promemorie-e-note')
  );

drop policy if exists "az_tl_pn_copie_update" on public.azienda_timeline_pn_copie;
create policy "az_tl_pn_copie_update"
  on public.azienda_timeline_pn_copie for update
  to authenticated
  using (
    public.is_superadmin()
    or public.has_area_access('amministrazione')
    or public.has_area_access('promemorie-e-note')
  )
  with check (
    public.is_superadmin()
    or public.has_area_access('amministrazione')
    or public.has_area_access('promemorie-e-note')
  );

grant select, insert, update on table public.azienda_timeline_pn_copie to authenticated;
grant all on table public.azienda_timeline_pn_copie to postgres, service_role;
revoke delete on table public.azienda_timeline_pn_copie from authenticated;

notify pgrst, 'reload schema';
