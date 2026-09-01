-- Isolamento/confezione ↔ prodotti + doppio ruolo + max kg (ISO 9001)

alter table public.imballaggi_voci
  add column if not exists doppio_ruolo boolean not null default false;

comment on column public.imballaggi_voci.doppio_ruolo is
  'Se true (solo confezione/isolamento): la voce funge da entrambi gli stadi; in wizard una sola selezione';

alter table public.imballaggi_voci
  drop constraint if exists imballaggi_voci_doppio_ruolo_stadio_check;

alter table public.imballaggi_voci
  add constraint imballaggi_voci_doppio_ruolo_stadio_check
  check (
    doppio_ruolo = false
    or stadio in ('confezione', 'isolamento')
  );

create table if not exists public.imballaggi_voci_prodotti (
  id uuid primary key default gen_random_uuid(),
  voce_id uuid not null references public.imballaggi_voci (id) on delete cascade,
  prodotto_id uuid not null references public.prodotti_propri (id) on delete restrict,
  max_kg numeric(14, 4) not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  created_by uuid references auth.users (id) on delete set null,
  updated_by uuid references auth.users (id) on delete set null,
  deleted_at timestamptz,
  deleted_by uuid references auth.users (id) on delete set null,
  constraint imballaggi_voci_prodotti_max_kg_check check (max_kg > 0)
);

comment on table public.imballaggi_voci_prodotti is
  'Collegamento isolamento/confezione-doppio ruolo a prodotti Agrinsicilia; max_kg = capacità prodotto in quella voce';
comment on column public.imballaggi_voci_prodotti.max_kg is
  'Kg massimi di quel prodotto inseribili nella voce (0–x in uso operativo)';

create unique index if not exists imballaggi_voci_prodotti_attivo_uidx
  on public.imballaggi_voci_prodotti (voce_id, prodotto_id)
  where deleted_at is null;

create index if not exists imballaggi_voci_prodotti_voce_idx
  on public.imballaggi_voci_prodotti (voce_id)
  where deleted_at is null;

create index if not exists imballaggi_voci_prodotti_prodotto_idx
  on public.imballaggi_voci_prodotti (prodotto_id)
  where deleted_at is null;

drop trigger if exists imballaggi_voci_prodotti_updated_at on public.imballaggi_voci_prodotti;
create trigger imballaggi_voci_prodotti_updated_at
  before update on public.imballaggi_voci_prodotti
  for each row execute function public.set_updated_at();

alter table public.imballaggi_voci_prodotti enable row level security;

drop policy if exists "imballaggi_voci_prodotti_all" on public.imballaggi_voci_prodotti;
create policy "imballaggi_voci_prodotti_all"
  on public.imballaggi_voci_prodotti for all to authenticated
  using (public.has_area_access('amministrazione') or public.is_superadmin())
  with check (public.has_area_access('amministrazione') or public.is_superadmin());

grant select, insert, update on table public.imballaggi_voci_prodotti to authenticated;
grant all on table public.imballaggi_voci_prodotti to postgres, service_role;
revoke delete on table public.imballaggi_voci_prodotti from authenticated;
