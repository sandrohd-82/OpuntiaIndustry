-- Beni ammortizzabili su righe + elaborazioni contabili trimestrali (ISO 9001)

-- ---------------------------------------------------------------------------
-- Flag cespiti sulle righe
-- ---------------------------------------------------------------------------
alter table public.fatture_emesse_righe
  add column if not exists is_bene_ammortizzabile boolean not null default false;

alter table public.fatture_ricevute_righe
  add column if not exists is_bene_ammortizzabile boolean not null default false;

comment on column public.fatture_emesse_righe.is_bene_ammortizzabile is
  'Se true: voce destinata a uscita dal registro cespiti (vendita/dismissione)';
comment on column public.fatture_ricevute_righe.is_bene_ammortizzabile is
  'Se true: voce destinata a ingresso nel registro cespiti (acquisto)';

-- ---------------------------------------------------------------------------
-- Elaborazioni contabili (trimestre)
-- ---------------------------------------------------------------------------
create table if not exists public.elaborazioni_contabili (
  id uuid primary key default gen_random_uuid(),
  kind text not null check (kind in ('emessa', 'ricevuta')),
  anno integer not null check (anno >= 2000 and anno <= 2100),
  trimestre integer not null check (trimestre between 1 and 4),
  documento_stato text not null default 'bozza'
    check (documento_stato in ('bozza', 'approvato', 'chiuso')),
  versione integer not null default 1 check (versione >= 1),
  note text not null default '',
  created_by uuid references auth.users (id) on delete set null,
  updated_by uuid references auth.users (id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz,
  deleted_by uuid references auth.users (id) on delete set null
);

create unique index if not exists elaborazioni_contabili_uidx
  on public.elaborazioni_contabili (kind, anno, trimestre)
  where deleted_at is null;

comment on table public.elaborazioni_contabili is
  'Elaborazione contabile trimestrale fatture emesse/ricevute (numerazione vignetta)';

drop trigger if exists elaborazioni_contabili_updated_at
  on public.elaborazioni_contabili;
create trigger elaborazioni_contabili_updated_at
  before update on public.elaborazioni_contabili
  for each row execute function public.set_updated_at();

alter table public.elaborazioni_contabili enable row level security;
drop policy if exists "elaborazioni_contabili_all" on public.elaborazioni_contabili;
create policy "elaborazioni_contabili_all"
  on public.elaborazioni_contabili for all to authenticated
  using (public.has_area_access('amministrazione') or public.is_superadmin())
  with check (public.has_area_access('amministrazione') or public.is_superadmin());

grant select, insert, update on table public.elaborazioni_contabili to authenticated;
grant all on table public.elaborazioni_contabili to postgres, service_role;
revoke delete on table public.elaborazioni_contabili from authenticated;

-- ---------------------------------------------------------------------------
-- Voci elaborazione (fattura + vignetta)
-- ---------------------------------------------------------------------------
create table if not exists public.elaborazioni_contabili_voci (
  id uuid primary key default gen_random_uuid(),
  elaborazione_id uuid not null
    references public.elaborazioni_contabili (id) on delete cascade,
  fattura_id uuid not null,
  numera_con_vignetta boolean not null default false,
  numero_vignetta integer,
  sort_order integer not null default 0,
  created_by uuid references auth.users (id) on delete set null,
  updated_by uuid references auth.users (id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz,
  deleted_by uuid references auth.users (id) on delete set null,
  constraint elaborazioni_contabili_voci_numero_check
    check (numero_vignetta is null or numero_vignetta >= 1)
);

create unique index if not exists elaborazioni_contabili_voci_uidx
  on public.elaborazioni_contabili_voci (elaborazione_id, fattura_id)
  where deleted_at is null;

create index if not exists elaborazioni_contabili_voci_elab_idx
  on public.elaborazioni_contabili_voci (elaborazione_id)
  where deleted_at is null;

comment on table public.elaborazioni_contabili_voci is
  'Fatture incluse in elaborazione trimestrale; numero_vignetta 1..X se flag attivo';

drop trigger if exists elaborazioni_contabili_voci_updated_at
  on public.elaborazioni_contabili_voci;
create trigger elaborazioni_contabili_voci_updated_at
  before update on public.elaborazioni_contabili_voci
  for each row execute function public.set_updated_at();

alter table public.elaborazioni_contabili_voci enable row level security;
drop policy if exists "elaborazioni_contabili_voci_all"
  on public.elaborazioni_contabili_voci;
create policy "elaborazioni_contabili_voci_all"
  on public.elaborazioni_contabili_voci for all to authenticated
  using (public.has_area_access('amministrazione') or public.is_superadmin())
  with check (public.has_area_access('amministrazione') or public.is_superadmin());

grant select, insert, update on table public.elaborazioni_contabili_voci
  to authenticated;
grant all on table public.elaborazioni_contabili_voci
  to postgres, service_role;
revoke delete on table public.elaborazioni_contabili_voci from authenticated;
