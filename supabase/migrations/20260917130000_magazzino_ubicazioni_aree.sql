-- Aree riponibili: anagrafica logica + forma sulla pianta (ISO 9001).
-- Stesso posto (A / A1) può comparire su più viste. Soft delete, audit.

create table if not exists public.magazzino_ubicazioni (
  id uuid primary key default gen_random_uuid(),
  codice text not null,
  nome text not null,
  parent_id uuid references public.magazzino_ubicazioni (id) on delete set null,
  tipo text not null default 'riponibile',
  luogo_nome text not null default '',
  mappa_origine_id uuid references public.magazzino_mappe (id) on delete set null,
  documento_stato text not null default 'bozza',
  versione int not null default 1,
  note text not null default '',
  created_by uuid references auth.users (id) on delete set null,
  updated_by uuid references auth.users (id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz,
  deleted_by uuid references auth.users (id) on delete set null,
  constraint mag_ubic_tipo_check check (tipo in ('riponibile')),
  constraint mag_ubic_stato_check check (
    documento_stato in ('bozza', 'approvato', 'chiuso')
  ),
  constraint mag_ubic_codice_check check (char_length(trim(codice)) between 1 and 40)
);

create unique index if not exists mag_ubic_luogo_codice_uidx
  on public.magazzino_ubicazioni (lower(luogo_nome), lower(codice))
  where deleted_at is null and luogo_nome <> '';

create unique index if not exists mag_ubic_mappa_codice_uidx
  on public.magazzino_ubicazioni (mappa_origine_id, lower(codice))
  where deleted_at is null and luogo_nome = '' and mappa_origine_id is not null;

create index if not exists mag_ubic_parent_idx
  on public.magazzino_ubicazioni (parent_id)
  where deleted_at is null;

comment on table public.magazzino_ubicazioni is
  'Posto logico riponibile (es. colonna A, ripiano A1). Usato dai movimenti magazzino.';

drop trigger if exists mag_ubic_updated_at on public.magazzino_ubicazioni;
create trigger mag_ubic_updated_at
  before update on public.magazzino_ubicazioni
  for each row execute function public.set_updated_at();

alter table public.magazzino_ubicazioni enable row level security;
drop policy if exists "mag_ubic_select" on public.magazzino_ubicazioni;
create policy "mag_ubic_select"
  on public.magazzino_ubicazioni for select
  to authenticated
  using (
    public.is_superadmin()
    or public.has_area_access('magazzino')
    or public.has_area_access('strumenti')
    or public.has_area_access('amministrazione')
  );
drop policy if exists "mag_ubic_write" on public.magazzino_ubicazioni;
create policy "mag_ubic_write"
  on public.magazzino_ubicazioni for insert
  to authenticated
  with check (
    public.is_superadmin()
    or public.has_area_access('amministrazione')
  );
drop policy if exists "mag_ubic_update" on public.magazzino_ubicazioni;
create policy "mag_ubic_update"
  on public.magazzino_ubicazioni for update
  to authenticated
  using (
    public.is_superadmin()
    or public.has_area_access('amministrazione')
  )
  with check (
    public.is_superadmin()
    or public.has_area_access('amministrazione')
  );

grant select, insert, update on table public.magazzino_ubicazioni to authenticated;
grant all on table public.magazzino_ubicazioni to postgres, service_role;
revoke delete on table public.magazzino_ubicazioni from authenticated;

create table if not exists public.magazzino_mappa_aree (
  id uuid primary key default gen_random_uuid(),
  mappa_id uuid not null references public.magazzino_mappe (id) on delete cascade,
  ubicazione_id uuid not null references public.magazzino_ubicazioni (id),
  x numeric(14, 3) not null,
  y numeric(14, 3) not null,
  width numeric(14, 3) not null,
  height numeric(14, 3) not null,
  sort_order int not null default 0,
  created_by uuid references auth.users (id) on delete set null,
  updated_by uuid references auth.users (id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz,
  deleted_by uuid references auth.users (id) on delete set null,
  constraint mag_mappa_aree_size_check check (width > 0 and height > 0)
);

create index if not exists mag_mappa_aree_mappa_idx
  on public.magazzino_mappa_aree (mappa_id, sort_order)
  where deleted_at is null;

create unique index if not exists mag_mappa_aree_mappa_ubi_uidx
  on public.magazzino_mappa_aree (mappa_id, ubicazione_id)
  where deleted_at is null;

comment on table public.magazzino_mappa_aree is
  'Rettangolo di un posto logico su una pianta (vista).';

drop trigger if exists mag_mappa_aree_updated_at on public.magazzino_mappa_aree;
create trigger mag_mappa_aree_updated_at
  before update on public.magazzino_mappa_aree
  for each row execute function public.set_updated_at();

alter table public.magazzino_mappa_aree enable row level security;
drop policy if exists "mag_mappa_aree_select" on public.magazzino_mappa_aree;
create policy "mag_mappa_aree_select"
  on public.magazzino_mappa_aree for select
  to authenticated
  using (
    public.is_superadmin()
    or public.has_area_access('magazzino')
    or public.has_area_access('strumenti')
    or public.has_area_access('amministrazione')
  );
drop policy if exists "mag_mappa_aree_write" on public.magazzino_mappa_aree;
create policy "mag_mappa_aree_write"
  on public.magazzino_mappa_aree for insert
  to authenticated
  with check (
    public.is_superadmin()
    or public.has_area_access('amministrazione')
  );
drop policy if exists "mag_mappa_aree_update" on public.magazzino_mappa_aree;
create policy "mag_mappa_aree_update"
  on public.magazzino_mappa_aree for update
  to authenticated
  using (
    public.is_superadmin()
    or public.has_area_access('amministrazione')
  )
  with check (
    public.is_superadmin()
    or public.has_area_access('amministrazione')
  );

grant select, insert, update on table public.magazzino_mappa_aree to authenticated;
grant all on table public.magazzino_mappa_aree to postgres, service_role;
revoke delete on table public.magazzino_mappa_aree from authenticated;

alter table public.magazzino_movimenti
  add column if not exists ubicazione_id uuid references public.magazzino_ubicazioni (id) on delete set null;

comment on column public.magazzino_movimenti.ubicazione_id is
  'Posto riponibile (rimandabile). Non blocca il salvataggio quantità.';

create index if not exists mag_mov_ubicazione_idx
  on public.magazzino_movimenti (ubicazione_id)
  where deleted_at is null and ubicazione_id is not null;

notify pgrst, 'reload schema';
