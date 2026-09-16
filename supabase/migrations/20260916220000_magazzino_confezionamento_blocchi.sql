-- Confezionamento a blocchi sul lotto Agrinsicilia (stessa logica degli ordini).
-- Header + albero: movimentazione (pallet) → confezione → isolamento → kg.
-- Rimandabile: non blocca il salvataggio della quantità.

create table if not exists public.magazzino_confezionamento (
  id uuid primary key default gen_random_uuid(),
  prodotto_id uuid not null references public.prodotti_propri (id) on delete restrict,
  lotto_codice text not null,
  movimento_id uuid references public.magazzino_movimenti (id) on delete set null,
  movimentazione_modo text not null default 'su_pallet',
  pallet_catalogo_id uuid references public.imballaggi_voci (id) on delete set null,
  pallet_misure_custom text not null default '',
  kg_carico numeric(14, 3) not null default 0,
  kg_confezionati numeric(14, 3) not null default 0,
  kg_delta numeric(14, 3) not null default 0,
  coerenza_ignorata boolean not null default false,
  rimandato boolean not null default false,
  riepilogo text not null default '',
  note text not null default '',
  versione int not null default 1,
  documento_stato text not null default 'bozza',
  created_by uuid references auth.users (id) on delete set null,
  updated_by uuid references auth.users (id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz,
  deleted_by uuid references auth.users (id) on delete set null,
  constraint mag_conf_modo_check check (
    movimentazione_modo in ('su_pallet', 'nessun_pallet')
  ),
  constraint mag_conf_stato_check check (
    documento_stato in ('bozza', 'approvato', 'chiuso')
  )
);

create unique index if not exists magazzino_confezionamento_lotto_uidx
  on public.magazzino_confezionamento (prodotto_id, lotto_codice)
  where deleted_at is null;

comment on table public.magazzino_confezionamento is
  'Header confezionamento lotto magazzino: blocchi pallet/confezione/isolamento';

drop trigger if exists magazzino_confezionamento_updated_at on public.magazzino_confezionamento;
create trigger magazzino_confezionamento_updated_at
  before update on public.magazzino_confezionamento
  for each row execute function public.set_updated_at();

alter table public.magazzino_confezionamento enable row level security;
drop policy if exists "magazzino_confezionamento_all" on public.magazzino_confezionamento;
create policy "magazzino_confezionamento_all"
  on public.magazzino_confezionamento for all to authenticated
  using (
    public.has_area_access('magazzino')
    or public.has_area_access('amministrazione')
    or public.is_superadmin()
  )
  with check (
    public.has_area_access('magazzino')
    or public.has_area_access('amministrazione')
    or public.is_superadmin()
  );

grant select, insert, update on table public.magazzino_confezionamento to authenticated;
grant all on table public.magazzino_confezionamento to postgres, service_role;
revoke delete on table public.magazzino_confezionamento from authenticated;

create table if not exists public.magazzino_confezionamento_nodi (
  id uuid primary key default gen_random_uuid(),
  confezionamento_id uuid not null references public.magazzino_confezionamento (id) on delete cascade,
  parent_id uuid references public.magazzino_confezionamento_nodi (id) on delete cascade,
  stadio text not null,
  catalogo_id uuid references public.imballaggi_voci (id) on delete set null,
  nome_snapshot text not null default '',
  codice_snapshot text not null default '',
  quantita numeric(14, 3) not null default 1,
  kg_prodotto numeric(14, 3),
  sort_order int not null default 0,
  created_by uuid references auth.users (id) on delete set null,
  updated_by uuid references auth.users (id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz,
  deleted_by uuid references auth.users (id) on delete set null,
  constraint mag_conf_nodi_stadio_check check (
    stadio in ('movimentazione', 'confezione', 'isolamento', 'prodotto_kg')
  ),
  constraint mag_conf_nodi_qta_check check (quantita > 0)
);

create index if not exists mag_conf_nodi_parent_idx
  on public.magazzino_confezionamento_nodi (confezionamento_id, parent_id)
  where deleted_at is null;

comment on table public.magazzino_confezionamento_nodi is
  'Albero confezionamento magazzino: pallet → cartone → sacco → kg';

drop trigger if exists mag_conf_nodi_updated_at on public.magazzino_confezionamento_nodi;
create trigger mag_conf_nodi_updated_at
  before update on public.magazzino_confezionamento_nodi
  for each row execute function public.set_updated_at();

alter table public.magazzino_confezionamento_nodi enable row level security;
drop policy if exists "mag_conf_nodi_all" on public.magazzino_confezionamento_nodi;
create policy "mag_conf_nodi_all"
  on public.magazzino_confezionamento_nodi for all to authenticated
  using (
    public.has_area_access('magazzino')
    or public.has_area_access('amministrazione')
    or public.is_superadmin()
  )
  with check (
    public.has_area_access('magazzino')
    or public.has_area_access('amministrazione')
    or public.is_superadmin()
  );

grant select, insert, update on table public.magazzino_confezionamento_nodi to authenticated;
grant all on table public.magazzino_confezionamento_nodi to postgres, service_role;
revoke delete on table public.magazzino_confezionamento_nodi from authenticated;

-- Magazzino legge i collegamenti voce↔prodotto per filtrare isolamento/C&I.
drop policy if exists "imballaggi_voci_prodotti_select" on public.imballaggi_voci_prodotti;
create policy "imballaggi_voci_prodotti_select"
  on public.imballaggi_voci_prodotti for select
  to authenticated
  using (
    public.is_superadmin()
    or public.has_area_access('amministrazione')
    or public.has_area_access('commerciale')
    or public.has_area_access('magazzino')
    or public.has_area_access('produzione')
  );

notify pgrst, 'reload schema';
