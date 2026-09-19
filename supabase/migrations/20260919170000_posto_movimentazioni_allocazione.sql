-- Settaggio movimentazioni ammesse + allocazione lotto sul posto (ISO 9001).
-- Soft delete, audit. Nessun delete fisico.

create table if not exists public.magazzino_ubicazione_movimentazioni (
  id uuid primary key default gen_random_uuid(),
  ubicazione_id uuid not null references public.magazzino_ubicazioni (id),
  imballaggio_voce_id uuid not null references public.imballaggi_voci (id),
  created_by uuid references auth.users (id) on delete set null,
  updated_by uuid references auth.users (id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz,
  deleted_by uuid references auth.users (id) on delete set null
);

create unique index if not exists mag_ubi_mov_attive_uidx
  on public.magazzino_ubicazione_movimentazioni (ubicazione_id, imballaggio_voce_id)
  where deleted_at is null;

create index if not exists mag_ubi_mov_ubi_idx
  on public.magazzino_ubicazione_movimentazioni (ubicazione_id)
  where deleted_at is null;

comment on table public.magazzino_ubicazione_movimentazioni is
  'Movimentazioni (pallet, bins, …) ammesse sul posto. Solo queste in occupazione.';

drop trigger if exists mag_ubi_mov_updated_at on public.magazzino_ubicazione_movimentazioni;
create trigger mag_ubi_mov_updated_at
  before update on public.magazzino_ubicazione_movimentazioni
  for each row execute function public.set_updated_at();

alter table public.magazzino_posto_occupazioni
  add column if not exists movimentazione_voce_id uuid references public.imballaggi_voci (id) on delete set null,
  add column if not exists movimentazione_nome text not null default '',
  add column if not exists peso_modo text not null default 'per_elemento',
  add column if not exists peso_complessivo_kg numeric(12, 3),
  add column if not exists peso_motivazione text not null default '',
  add column if not exists prodotto_id uuid references public.prodotti_propri (id) on delete set null,
  add column if not exists kg_allocati numeric(12, 3);

alter table public.magazzino_posto_occupazioni
  drop constraint if exists mag_posto_occ_peso_modo_check;
alter table public.magazzino_posto_occupazioni
  add constraint mag_posto_occ_peso_modo_check
  check (peso_modo in ('per_elemento', 'complessivo'));

comment on column public.magazzino_posto_occupazioni.movimentazione_voce_id is
  'Tipo movimentazione (pallet/bins) scelto in occupazione.';
comment on column public.magazzino_posto_occupazioni.imballaggio_voce_id is
  'Tipo elemento: una sola voce confezione o isolamento (cartone o sacchetto).';
comment on column public.magazzino_posto_occupazioni.peso_modo is
  'per_elemento = un peso e un codice per pezzo; complessivo = un codice solo, motivazione obbligatoria.';

create table if not exists public.magazzino_posto_allocazioni (
  id uuid primary key default gen_random_uuid(),
  occupazione_id uuid not null references public.magazzino_posto_occupazioni (id),
  ubicazione_id uuid not null references public.magazzino_ubicazioni (id),
  prodotto_id uuid not null references public.prodotti_propri (id),
  lotto_interno_codice text not null,
  lotto_esterno_id uuid references public.lotti_esterni (id) on delete set null,
  lotto_esterno_codice text,
  kg numeric(12, 3) not null,
  stato text not null default 'attivo',
  documento_stato text not null default 'bozza',
  versione int not null default 1,
  created_by uuid references auth.users (id) on delete set null,
  updated_by uuid references auth.users (id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz,
  deleted_by uuid references auth.users (id) on delete set null,
  constraint mag_posto_all_kg_check check (kg > 0),
  constraint mag_posto_all_stato_check check (stato in ('attivo', 'liberato')),
  constraint mag_posto_all_doc_check check (
    documento_stato in ('bozza', 'approvato', 'chiuso')
  )
);

create index if not exists mag_posto_all_lotto_idx
  on public.magazzino_posto_allocazioni (prodotto_id, lotto_interno_codice)
  where deleted_at is null and stato = 'attivo';

create index if not exists mag_posto_all_occ_idx
  on public.magazzino_posto_allocazioni (occupazione_id)
  where deleted_at is null;

comment on table public.magazzino_posto_allocazioni is
  'Kg del lotto sistemati sul posto. Sottratti dal residuo da sistemare.';

drop trigger if exists mag_posto_all_updated_at on public.magazzino_posto_allocazioni;
create trigger mag_posto_all_updated_at
  before update on public.magazzino_posto_allocazioni
  for each row execute function public.set_updated_at();

alter table public.magazzino_ubicazione_movimentazioni enable row level security;
alter table public.magazzino_posto_allocazioni enable row level security;

drop policy if exists "mag_ubi_mov_select" on public.magazzino_ubicazione_movimentazioni;
create policy "mag_ubi_mov_select"
  on public.magazzino_ubicazione_movimentazioni for select
  to authenticated
  using (
    public.is_superadmin()
    or public.has_area_access('magazzino')
    or public.has_area_access('strumenti')
    or public.has_area_access('amministrazione')
  );

drop policy if exists "mag_ubi_mov_write" on public.magazzino_ubicazione_movimentazioni;
create policy "mag_ubi_mov_write"
  on public.magazzino_ubicazione_movimentazioni for insert
  to authenticated
  with check (
    public.is_superadmin()
    or public.has_area_access('magazzino')
    or public.has_area_access('amministrazione')
  );

drop policy if exists "mag_ubi_mov_update" on public.magazzino_ubicazione_movimentazioni;
create policy "mag_ubi_mov_update"
  on public.magazzino_ubicazione_movimentazioni for update
  to authenticated
  using (
    public.is_superadmin()
    or public.has_area_access('magazzino')
    or public.has_area_access('amministrazione')
  )
  with check (
    public.is_superadmin()
    or public.has_area_access('magazzino')
    or public.has_area_access('amministrazione')
  );

drop policy if exists "mag_posto_all_select" on public.magazzino_posto_allocazioni;
create policy "mag_posto_all_select"
  on public.magazzino_posto_allocazioni for select
  to authenticated
  using (
    public.is_superadmin()
    or public.has_area_access('magazzino')
    or public.has_area_access('strumenti')
    or public.has_area_access('amministrazione')
  );

drop policy if exists "mag_posto_all_write" on public.magazzino_posto_allocazioni;
create policy "mag_posto_all_write"
  on public.magazzino_posto_allocazioni for insert
  to authenticated
  with check (
    public.is_superadmin()
    or public.has_area_access('magazzino')
    or public.has_area_access('amministrazione')
  );

drop policy if exists "mag_posto_all_update" on public.magazzino_posto_allocazioni;
create policy "mag_posto_all_update"
  on public.magazzino_posto_allocazioni for update
  to authenticated
  using (
    public.is_superadmin()
    or public.has_area_access('magazzino')
    or public.has_area_access('amministrazione')
  )
  with check (
    public.is_superadmin()
    or public.has_area_access('magazzino')
    or public.has_area_access('amministrazione')
  );

grant select, insert, update on table public.magazzino_ubicazione_movimentazioni to authenticated;
grant select, insert, update on table public.magazzino_posto_allocazioni to authenticated;
grant all on table public.magazzino_ubicazione_movimentazioni to postgres, service_role;
grant all on table public.magazzino_posto_allocazioni to postgres, service_role;
revoke delete on table public.magazzino_ubicazione_movimentazioni from authenticated;
revoke delete on table public.magazzino_posto_allocazioni from authenticated;
