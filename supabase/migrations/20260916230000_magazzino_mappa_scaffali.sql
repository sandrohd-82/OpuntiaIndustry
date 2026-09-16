-- Mappa Magazzino: pianta 2D con linee rette e spessore (ISO 9001).
-- Super admin progetta; magazzino legge la pianta approvata.

create table if not exists public.magazzino_mappe (
  id uuid primary key default gen_random_uuid(),
  nome text not null default 'Pianta principale',
  versione int not null default 1,
  documento_stato text not null default 'bozza',
  view_x numeric(14, 3) not null default 0,
  view_y numeric(14, 3) not null default 0,
  view_zoom numeric(10, 4) not null default 1,
  griglia_px numeric(10, 2) not null default 20,
  note text not null default '',
  approved_at timestamptz,
  approved_by uuid references auth.users (id) on delete set null,
  created_by uuid references auth.users (id) on delete set null,
  updated_by uuid references auth.users (id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz,
  deleted_by uuid references auth.users (id) on delete set null,
  constraint mag_mappe_stato_check check (
    documento_stato in ('bozza', 'approvato', 'chiuso')
  ),
  constraint mag_mappe_zoom_check check (view_zoom > 0 and view_zoom <= 20),
  constraint mag_mappe_griglia_check check (griglia_px > 0)
);

create unique index if not exists magazzino_mappe_attiva_uidx
  on public.magazzino_mappe ((true))
  where deleted_at is null;

comment on table public.magazzino_mappe is
  'Documento pianta magazzino: vista, versione e stato approvazione';

drop trigger if exists magazzino_mappe_updated_at on public.magazzino_mappe;
create trigger magazzino_mappe_updated_at
  before update on public.magazzino_mappe
  for each row execute function public.set_updated_at();

alter table public.magazzino_mappe enable row level security;
drop policy if exists "magazzino_mappe_select" on public.magazzino_mappe;
create policy "magazzino_mappe_select"
  on public.magazzino_mappe for select
  to authenticated
  using (
    public.is_superadmin()
    or public.has_area_access('magazzino')
    or public.has_area_access('amministrazione')
  );
drop policy if exists "magazzino_mappe_write" on public.magazzino_mappe;
create policy "magazzino_mappe_write"
  on public.magazzino_mappe for insert
  to authenticated
  with check (
    public.is_superadmin()
    or public.has_area_access('amministrazione')
  );
drop policy if exists "magazzino_mappe_update" on public.magazzino_mappe;
create policy "magazzino_mappe_update"
  on public.magazzino_mappe for update
  to authenticated
  using (
    public.is_superadmin()
    or public.has_area_access('amministrazione')
  )
  with check (
    public.is_superadmin()
    or public.has_area_access('amministrazione')
  );

grant select, insert, update on table public.magazzino_mappe to authenticated;
grant all on table public.magazzino_mappe to postgres, service_role;
revoke delete on table public.magazzino_mappe from authenticated;

create table if not exists public.magazzino_mappa_linee (
  id uuid primary key default gen_random_uuid(),
  mappa_id uuid not null references public.magazzino_mappe (id) on delete cascade,
  x1 numeric(14, 3) not null,
  y1 numeric(14, 3) not null,
  x2 numeric(14, 3) not null,
  y2 numeric(14, 3) not null,
  spessore numeric(10, 2) not null default 4,
  sort_order int not null default 0,
  note text not null default '',
  created_by uuid references auth.users (id) on delete set null,
  updated_by uuid references auth.users (id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz,
  deleted_by uuid references auth.users (id) on delete set null,
  constraint mag_mappa_linee_spessore_check check (spessore > 0 and spessore <= 80)
);

create index if not exists mag_mappa_linee_mappa_idx
  on public.magazzino_mappa_linee (mappa_id, sort_order)
  where deleted_at is null;

comment on table public.magazzino_mappa_linee is
  'Tratti retti della pianta: estremi e spessore';

drop trigger if exists mag_mappa_linee_updated_at on public.magazzino_mappa_linee;
create trigger mag_mappa_linee_updated_at
  before update on public.magazzino_mappa_linee
  for each row execute function public.set_updated_at();

alter table public.magazzino_mappa_linee enable row level security;
drop policy if exists "mag_mappa_linee_select" on public.magazzino_mappa_linee;
create policy "mag_mappa_linee_select"
  on public.magazzino_mappa_linee for select
  to authenticated
  using (
    public.is_superadmin()
    or public.has_area_access('magazzino')
    or public.has_area_access('amministrazione')
  );
drop policy if exists "mag_mappa_linee_write" on public.magazzino_mappa_linee;
create policy "mag_mappa_linee_write"
  on public.magazzino_mappa_linee for insert
  to authenticated
  with check (
    public.is_superadmin()
    or public.has_area_access('amministrazione')
  );
drop policy if exists "mag_mappa_linee_update" on public.magazzino_mappa_linee;
create policy "mag_mappa_linee_update"
  on public.magazzino_mappa_linee for update
  to authenticated
  using (
    public.is_superadmin()
    or public.has_area_access('amministrazione')
  )
  with check (
    public.is_superadmin()
    or public.has_area_access('amministrazione')
  );

grant select, insert, update on table public.magazzino_mappa_linee to authenticated;
grant all on table public.magazzino_mappa_linee to postgres, service_role;
revoke delete on table public.magazzino_mappa_linee from authenticated;

notify pgrst, 'reload schema';
