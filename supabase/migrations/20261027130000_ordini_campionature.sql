-- Campionature allegate a un ordine di vendita.
-- Non sono righe di fattura: si lavorano con l'ordine e vanno nel collo.

create table if not exists public.ordini_campionature (
  id uuid primary key default gen_random_uuid(),
  ordine_id uuid not null references public.ordini (id) on delete cascade,
  prodotto_id uuid references public.prodotti_propri (id) on delete set null,
  prodotto_codice text not null,
  prodotto_nome text not null,
  numero_confezioni integer not null,
  sort_order integer not null default 0,
  versione integer not null default 1,
  documento_stato text not null default 'approvato',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  created_by uuid references auth.users (id) on delete set null,
  updated_by uuid references auth.users (id) on delete set null,
  deleted_at timestamptz,
  deleted_by uuid references auth.users (id) on delete set null,
  constraint ordini_campionature_confezioni_check check (
    numero_confezioni >= 1 and numero_confezioni <= 9999
  ),
  constraint ordini_campionature_stato_check check (
    documento_stato in ('bozza', 'approvato', 'chiuso')
  ),
  constraint ordini_campionature_versione_check check (versione >= 1)
);

create index if not exists ordini_campionature_ordine_idx
  on public.ordini_campionature (ordine_id, sort_order)
  where deleted_at is null;

drop trigger if exists ordini_campionature_updated_at on public.ordini_campionature;
create trigger ordini_campionature_updated_at
  before update on public.ordini_campionature
  for each row execute function public.set_updated_at();

alter table public.ordini_campionature enable row level security;

drop policy if exists "ordini_campionature_select" on public.ordini_campionature;
create policy "ordini_campionature_select"
  on public.ordini_campionature for select to authenticated
  using (
    public.is_superadmin()
    or public.has_area_access('amministrazione')
    or public.has_area_access('commerciale')
    or public.has_area_access('produzione')
  );

drop policy if exists "ordini_campionature_insert" on public.ordini_campionature;
create policy "ordini_campionature_insert"
  on public.ordini_campionature for insert to authenticated
  with check (
    public.is_superadmin()
    or public.has_area_access('amministrazione')
    or public.has_area_access('commerciale')
  );

drop policy if exists "ordini_campionature_update" on public.ordini_campionature;
create policy "ordini_campionature_update"
  on public.ordini_campionature for update to authenticated
  using (
    public.is_superadmin()
    or public.has_area_access('amministrazione')
    or public.has_area_access('commerciale')
  )
  with check (
    public.is_superadmin()
    or public.has_area_access('amministrazione')
    or public.has_area_access('commerciale')
  );

grant select, insert, update on table public.ordini_campionature to authenticated;
grant all on table public.ordini_campionature to postgres, service_role;

comment on table public.ordini_campionature is
  'Campionatura spedita con l''ordine. Non compare in fattura. Si lavora insieme all''ordine e si inserisce nel collo.';
