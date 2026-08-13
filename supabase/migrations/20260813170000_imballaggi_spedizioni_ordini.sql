-- Imballaggi e spedizioni (Schede) + spedizione/confezionamento ordini — ISO 9001
-- Catalogo a 3 stadi: movimentazione | confezione | isolamento
-- Corrieri + campi spedizione ordine + albero confezionamento

-- ---------------------------------------------------------------------------
-- Catalogo imballaggi
-- ---------------------------------------------------------------------------
create table if not exists public.imballaggi_voci (
  id uuid primary key default gen_random_uuid(),
  stadio text not null,
  codice text not null,
  nome text not null,
  largo_mm numeric(10, 1),
  profondita_mm numeric(10, 1),
  altezza_mm numeric(10, 1),
  capacita_lt numeric(10, 2),
  note text not null default '',
  sort_order int not null default 0,
  created_by uuid references auth.users (id) on delete set null,
  updated_by uuid references auth.users (id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz,
  deleted_by uuid references auth.users (id) on delete set null,
  constraint imballaggi_voci_stadio_check check (
    stadio in ('movimentazione', 'confezione', 'isolamento')
  ),
  constraint imballaggi_voci_nome_len check (char_length(trim(nome)) >= 1)
);

create unique index if not exists imballaggi_voci_codice_stadio_uidx
  on public.imballaggi_voci (stadio, lower(codice))
  where deleted_at is null;

create index if not exists imballaggi_voci_stadio_idx
  on public.imballaggi_voci (stadio)
  where deleted_at is null;

comment on table public.imballaggi_voci is
  'Catalogo imballaggi Schede → Imballaggi e spedizioni (3 stadi)';

drop trigger if exists imballaggi_voci_updated_at on public.imballaggi_voci;
create trigger imballaggi_voci_updated_at
  before update on public.imballaggi_voci
  for each row execute function public.set_updated_at();

alter table public.imballaggi_voci enable row level security;
drop policy if exists "imballaggi_voci_all" on public.imballaggi_voci;
create policy "imballaggi_voci_all"
  on public.imballaggi_voci for all to authenticated
  using (public.has_area_access('amministrazione') or public.is_superadmin())
  with check (public.has_area_access('amministrazione') or public.is_superadmin());

grant select, insert, update on table public.imballaggi_voci to authenticated;
grant all on table public.imballaggi_voci to postgres, service_role;
revoke delete on table public.imballaggi_voci from authenticated;

-- Seed Stadio 1 — 20 pallet più usati (logistica EU/ISO/US)
insert into public.imballaggi_voci (stadio, codice, nome, largo_mm, profondita_mm, altezza_mm, sort_order)
select v.stadio, v.codice, v.nome, v.largo_mm, v.profondita_mm, v.altezza_mm, v.sort_order
from (values
  ('movimentazione', 'MOV-EPAL-1200x800', 'Europallet EPAL 1200×800', 1200, 800, null::numeric, 10),
  ('movimentazione', 'MOV-ISO-1200x1000', 'Pallet industriale ISO 1200×1000', 1200, 1000, null, 20),
  ('movimentazione', 'MOV-HALF-800x600', 'Mezzo Europallet / display 800×600', 800, 600, null, 30),
  ('movimentazione', 'MOV-1000x600', 'Pallet 1000×600', 1000, 600, null, 40),
  ('movimentazione', 'MOV-1200x1200', 'Pallet 1200×1200', 1200, 1200, null, 50),
  ('movimentazione', 'MOV-1100x1100', 'Pallet 1100×1100 (Asia/AU)', 1100, 1100, null, 60),
  ('movimentazione', 'MOV-GMA-48x40', 'Pallet GMA 1219×1016 (48×40")', 1219, 1016, null, 70),
  ('movimentazione', 'MOV-GMA-42x42', 'Pallet GMA 1067×1067 (42×42")', 1067, 1067, null, 80),
  ('movimentazione', 'MOV-1000x800', 'Pallet 1000×800', 1000, 800, null, 90),
  ('movimentazione', 'MOV-1200x600', 'Pallet 1200×600', 1200, 600, null, 100),
  ('movimentazione', 'MOV-800x800', 'Pallet 800×800', 800, 800, null, 110),
  ('movimentazione', 'MOV-1100x800', 'Pallet 1100×800', 1100, 800, null, 120),
  ('movimentazione', 'MOV-1140x1140', 'Pallet 1140×1140', 1140, 1140, null, 130),
  ('movimentazione', 'MOV-1200x1100', 'Pallet 1200×1100', 1200, 1100, null, 140),
  ('movimentazione', 'MOV-1000x1200', 'Pallet 1000×1200', 1000, 1200, null, 150),
  ('movimentazione', 'MOV-1300x1100', 'Pallet 1300×1100', 1300, 1100, null, 160),
  ('movimentazione', 'MOV-1400x1000', 'Pallet chimico 1400×1000', 1400, 1000, null, 170),
  ('movimentazione', 'MOV-UK-1200x1000', 'Pallet UK 1200×1000', 1200, 1000, null, 180),
  ('movimentazione', 'MOV-760x1140', 'Pallet UK 760×1140', 760, 1140, null, 190),
  ('movimentazione', 'MOV-CUSTOM', 'Pallet personalizzato (misure libere)', null, null, null, 200)
) as v(stadio, codice, nome, largo_mm, profondita_mm, altezza_mm, sort_order)
where not exists (
  select 1 from public.imballaggi_voci x
  where x.stadio = v.stadio and lower(x.codice) = lower(v.codice) and x.deleted_at is null
);

-- Seed Stadio 2 — confezioni iniziali (si popolano man mano)
insert into public.imballaggi_voci (stadio, codice, nome, largo_mm, profondita_mm, altezza_mm, capacita_lt, sort_order)
select v.stadio, v.codice, v.nome, v.largo_mm, v.profondita_mm, v.altezza_mm, v.capacita_lt, v.sort_order
from (values
  ('confezione', 'CNF-CART-60x40x50', 'Cartone 60×40×h50', 600, 400, 500, null::numeric, 10),
  ('confezione', 'CNF-CART-60x40x40', 'Cartone 60×40×h40', 600, 400, 400, null, 20),
  ('confezione', 'CNF-CART-17x40x18', 'Cartone 17×40×h18', 170, 400, 180, null, 30),
  ('confezione', 'CNF-BID-25', 'Bidone 25 lt', null, null, null, 25, 40),
  ('confezione', 'CNF-BID-5', 'Bidone 5 lt', null, null, null, 5, 50)
) as v(stadio, codice, nome, largo_mm, profondita_mm, altezza_mm, capacita_lt, sort_order)
where not exists (
  select 1 from public.imballaggi_voci x
  where x.stadio = v.stadio and lower(x.codice) = lower(v.codice) and x.deleted_at is null
);

-- Seed Stadio 3 — isolamento (sacchi) iniziali
insert into public.imballaggi_voci (stadio, codice, nome, largo_mm, profondita_mm, note, sort_order)
select v.stadio, v.codice, v.nome, v.largo_mm, v.profondita_mm, v.note, v.sort_order
from (values
  ('isolamento', 'ISO-HDL-1000x50', 'Sacco HDL 1000×50', 1000, 50, 'Sacco alimentare HDL', 10),
  ('isolamento', 'ISO-SAC-20x50', 'Sacco 20×50', 20, 50, '', 20),
  ('isolamento', 'ISO-SAC-30x50', 'Sacco 30×50', 30, 50, '', 30),
  ('isolamento', 'ISO-SAC-40x60', 'Sacco 40×60', 40, 60, '', 40),
  ('isolamento', 'ISO-SAC-50x80', 'Sacco 50×80', 50, 80, '', 50)
) as v(stadio, codice, nome, largo_mm, profondita_mm, note, sort_order)
where not exists (
  select 1 from public.imballaggi_voci x
  where x.stadio = v.stadio and lower(x.codice) = lower(v.codice) and x.deleted_at is null
);

-- ---------------------------------------------------------------------------
-- Corrieri
-- ---------------------------------------------------------------------------
create table if not exists public.corrieri (
  id uuid primary key default gen_random_uuid(),
  nome text not null,
  note text not null default '',
  created_by uuid references auth.users (id) on delete set null,
  updated_by uuid references auth.users (id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz,
  deleted_by uuid references auth.users (id) on delete set null,
  constraint corrieri_nome_len check (char_length(trim(nome)) >= 1)
);

create unique index if not exists corrieri_nome_uidx
  on public.corrieri (lower(trim(nome)))
  where deleted_at is null;

comment on table public.corrieri is
  'Anagrafica corrieri (Schede → Imballaggi e spedizioni)';

drop trigger if exists corrieri_updated_at on public.corrieri;
create trigger corrieri_updated_at
  before update on public.corrieri
  for each row execute function public.set_updated_at();

alter table public.corrieri enable row level security;
drop policy if exists "corrieri_all" on public.corrieri;
create policy "corrieri_all"
  on public.corrieri for all to authenticated
  using (public.has_area_access('amministrazione') or public.is_superadmin())
  with check (public.has_area_access('amministrazione') or public.is_superadmin());

grant select, insert, update on table public.corrieri to authenticated;
grant all on table public.corrieri to postgres, service_role;
revoke delete on table public.corrieri from authenticated;

-- ---------------------------------------------------------------------------
-- Ordini: spedizione
-- ---------------------------------------------------------------------------
alter table public.ordini
  add column if not exists spedizione_mezzo text not null default 'corriere',
  add column if not exists corriere_id uuid references public.corrieri (id) on delete set null,
  add column if not exists corriere_da_compilare boolean not null default false,
  add column if not exists spedizione_a_carico text,
  add column if not exists spedizione_pct_agrinsicilia numeric(5, 2);

alter table public.ordini drop constraint if exists ordini_spedizione_mezzo_check;
alter table public.ordini
  add constraint ordini_spedizione_mezzo_check
  check (spedizione_mezzo in ('corriere'));

alter table public.ordini drop constraint if exists ordini_spedizione_a_carico_check;
alter table public.ordini
  add constraint ordini_spedizione_a_carico_check
  check (
    spedizione_a_carico is null
    or spedizione_a_carico in ('cliente', 'agrinsicilia', 'diviso')
  );

alter table public.ordini drop constraint if exists ordini_spedizione_pct_check;
alter table public.ordini
  add constraint ordini_spedizione_pct_check
  check (
    spedizione_pct_agrinsicilia is null
    or (spedizione_pct_agrinsicilia >= 0 and spedizione_pct_agrinsicilia <= 100)
  );

comment on column public.ordini.spedizione_mezzo is
  'Mezzo spedizione: oggi solo corriere (sempre selezionato)';
comment on column public.ordini.corriere_da_compilare is
  'true = corriere da compilare dopo (corriere_id può essere null)';
comment on column public.ordini.spedizione_a_carico is
  'cliente | agrinsicilia | diviso';
comment on column public.ordini.spedizione_pct_agrinsicilia is
  'Solo se a carico = diviso: % Agrinsicilia; resto a cliente';

-- ---------------------------------------------------------------------------
-- Confezionamento ordine (header + nodi albero)
-- ---------------------------------------------------------------------------
create table if not exists public.ordini_confezionamento (
  id uuid primary key default gen_random_uuid(),
  ordine_id uuid not null references public.ordini (id) on delete cascade,
  movimentazione_modo text not null default 'su_pallet',
  pallet_catalogo_id uuid references public.imballaggi_voci (id) on delete set null,
  pallet_misure_custom text not null default '',
  kg_ordine numeric(14, 3) not null default 0,
  kg_confezionati numeric(14, 3) not null default 0,
  kg_delta numeric(14, 3) not null default 0,
  coerenza_ignorata boolean not null default false,
  note text not null default '',
  versione int not null default 1,
  documento_stato text not null default 'bozza',
  created_by uuid references auth.users (id) on delete set null,
  updated_by uuid references auth.users (id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz,
  deleted_by uuid references auth.users (id) on delete set null,
  constraint ordini_conf_modo_check check (
    movimentazione_modo in ('su_pallet', 'nessun_pallet')
  ),
  constraint ordini_conf_stato_check check (
    documento_stato in ('bozza', 'approvato', 'chiuso')
  )
);

create unique index if not exists ordini_confezionamento_ordine_uidx
  on public.ordini_confezionamento (ordine_id)
  where deleted_at is null;

comment on table public.ordini_confezionamento is
  'Header confezionamento ordine: movimentazione + totali coerenza kg';

drop trigger if exists ordini_confezionamento_updated_at on public.ordini_confezionamento;
create trigger ordini_confezionamento_updated_at
  before update on public.ordini_confezionamento
  for each row execute function public.set_updated_at();

alter table public.ordini_confezionamento enable row level security;
drop policy if exists "ordini_confezionamento_all" on public.ordini_confezionamento;
create policy "ordini_confezionamento_all"
  on public.ordini_confezionamento for all to authenticated
  using (public.has_area_access('amministrazione') or public.is_superadmin())
  with check (public.has_area_access('amministrazione') or public.is_superadmin());

grant select, insert, update on table public.ordini_confezionamento to authenticated;
grant all on table public.ordini_confezionamento to postgres, service_role;
revoke delete on table public.ordini_confezionamento from authenticated;

create table if not exists public.ordini_confezionamento_nodi (
  id uuid primary key default gen_random_uuid(),
  confezionamento_id uuid not null references public.ordini_confezionamento (id) on delete cascade,
  parent_id uuid references public.ordini_confezionamento_nodi (id) on delete cascade,
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
  constraint ordini_conf_nodi_stadio_check check (
    stadio in ('movimentazione', 'confezione', 'isolamento', 'prodotto_kg')
  ),
  constraint ordini_conf_nodi_qta_check check (quantita > 0),
  constraint ordini_conf_nodi_kg_check check (
    stadio <> 'prodotto_kg'
    or (kg_prodotto is not null and kg_prodotto > 0)
  )
);

create index if not exists ordini_conf_nodi_parent_idx
  on public.ordini_confezionamento_nodi (confezionamento_id, parent_id)
  where deleted_at is null;

comment on table public.ordini_confezionamento_nodi is
  'Albero confezionamento: pallet → cartone → sacco → kg prodotto';

drop trigger if exists ordini_conf_nodi_updated_at on public.ordini_confezionamento_nodi;
create trigger ordini_conf_nodi_updated_at
  before update on public.ordini_confezionamento_nodi
  for each row execute function public.set_updated_at();

alter table public.ordini_confezionamento_nodi enable row level security;
drop policy if exists "ordini_conf_nodi_all" on public.ordini_confezionamento_nodi;
create policy "ordini_conf_nodi_all"
  on public.ordini_confezionamento_nodi for all to authenticated
  using (public.has_area_access('amministrazione') or public.is_superadmin())
  with check (public.has_area_access('amministrazione') or public.is_superadmin());

grant select, insert, update on table public.ordini_confezionamento_nodi to authenticated;
grant all on table public.ordini_confezionamento_nodi to postgres, service_role;
revoke delete on table public.ordini_confezionamento_nodi from authenticated;
