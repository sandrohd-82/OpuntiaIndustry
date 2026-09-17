-- Guide di allineamento fra piante dello stesso magazzino (ISO 9001).
-- Asse copiato (larghezza/profondità) + punti di riferimento persistenti.

create table if not exists public.magazzino_mappa_riferimenti (
  id uuid primary key default gen_random_uuid(),
  mappa_id uuid not null references public.magazzino_mappe (id) on delete cascade,
  mappa_origine_id uuid not null references public.magazzino_mappe (id) on delete restrict,
  gruppo_id uuid not null,
  tipo text not null default 'punto',
  etichetta text not null default '',
  asse_origine text not null default 'x',
  offset_quadrati numeric(14, 3) not null default 0,
  limite_width_q numeric(14, 3) not null,
  limite_height_q numeric(14, 3) not null,
  dest_x numeric(14, 3) not null,
  dest_y numeric(14, 3) not null,
  dest_width numeric(14, 3) not null,
  dest_height numeric(14, 3) not null,
  origine_x numeric(14, 3) not null default 0,
  origine_y numeric(14, 3) not null default 0,
  origine_w numeric(14, 3) not null default 0,
  origine_h numeric(14, 3) not null default 0,
  sort_order int not null default 0,
  documento_stato text not null default 'bozza',
  versione int not null default 1,
  created_by uuid references auth.users (id) on delete set null,
  updated_by uuid references auth.users (id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz,
  deleted_by uuid references auth.users (id) on delete set null,
  constraint mag_rif_tipo_check check (tipo in ('asse', 'punto')),
  constraint mag_rif_asse_check check (asse_origine in ('x', 'y')),
  constraint mag_rif_stato_check check (
    documento_stato in ('bozza', 'approvato', 'chiuso')
  ),
  constraint mag_rif_size_check check (dest_width > 0 and dest_height > 0),
  constraint mag_rif_limite_check check (limite_width_q > 0 and limite_height_q > 0)
);

create index if not exists mag_rif_mappa_idx
  on public.magazzino_mappa_riferimenti (mappa_id, gruppo_id, sort_order)
  where deleted_at is null;

create unique index if not exists mag_rif_asse_gruppo_uidx
  on public.magazzino_mappa_riferimenti (gruppo_id)
  where deleted_at is null and tipo = 'asse';

comment on table public.magazzino_mappa_riferimenti is
  'Asse copiato e punti guida da una pianta origine verso un''altra vista dello stesso luogo.';

drop trigger if exists mag_rif_updated_at on public.magazzino_mappa_riferimenti;
create trigger mag_rif_updated_at
  before update on public.magazzino_mappa_riferimenti
  for each row execute function public.set_updated_at();

alter table public.magazzino_mappa_riferimenti enable row level security;
drop policy if exists "mag_rif_select" on public.magazzino_mappa_riferimenti;
create policy "mag_rif_select"
  on public.magazzino_mappa_riferimenti for select
  to authenticated
  using (
    public.is_superadmin()
    or public.has_area_access('magazzino')
    or public.has_area_access('strumenti')
    or public.has_area_access('amministrazione')
  );
drop policy if exists "mag_rif_write" on public.magazzino_mappa_riferimenti;
create policy "mag_rif_write"
  on public.magazzino_mappa_riferimenti for insert
  to authenticated
  with check (
    public.is_superadmin()
    or public.has_area_access('amministrazione')
  );
drop policy if exists "mag_rif_update" on public.magazzino_mappa_riferimenti;
create policy "mag_rif_update"
  on public.magazzino_mappa_riferimenti for update
  to authenticated
  using (
    public.is_superadmin()
    or public.has_area_access('amministrazione')
  )
  with check (
    public.is_superadmin()
    or public.has_area_access('amministrazione')
  );

grant select, insert, update on table public.magazzino_mappa_riferimenti to authenticated;
grant all on table public.magazzino_mappa_riferimenti to postgres, service_role;
revoke delete on table public.magazzino_mappa_riferimenti from authenticated;

notify pgrst, 'reload schema';
