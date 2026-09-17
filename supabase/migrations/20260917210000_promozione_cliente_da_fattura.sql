-- Promozione possibile → cliente solo da fattura (non da ordine/campionatura).
-- ISO 9001 §8.5.2: chi/quando, soft delete, audit applicativo + timeline.

alter table public.campionature
  add column if not exists cliente_possibile_id uuid
    references public.clienti_possibili (id) on delete set null;

alter table public.ordini
  add column if not exists cliente_possibile_id uuid
    references public.clienti_possibili (id) on delete set null;

alter table public.fatture_emesse
  add column if not exists cliente_possibile_id uuid
    references public.clienti_possibili (id) on delete set null;

create index if not exists campionature_cliente_possibile_idx
  on public.campionature (cliente_possibile_id)
  where deleted_at is null;

create index if not exists ordini_cliente_possibile_idx
  on public.ordini (cliente_possibile_id)
  where deleted_at is null;

create index if not exists fatture_emesse_cliente_possibile_idx
  on public.fatture_emesse (cliente_possibile_id)
  where deleted_at is null;

create table if not exists public.clienti_possibili_promozioni (
  id uuid primary key default gen_random_uuid(),
  cliente_possibile_id uuid not null
    references public.clienti_possibili (id) on delete restrict,
  cliente_id uuid references public.clienti (id) on delete set null,
  fattura_emessa_id uuid references public.fatture_emesse (id) on delete set null,
  fic_id bigint,
  numero_fattura text not null default '',
  data_fattura date,
  totale numeric(14, 2),
  partita_iva text not null default '',
  stato text not null default 'aperta'
    check (stato in ('aperta', 'completata', 'annullata')),
  completed_at timestamptz,
  completed_by uuid references auth.users (id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  created_by uuid references auth.users (id) on delete set null,
  updated_by uuid references auth.users (id) on delete set null,
  deleted_at timestamptz,
  deleted_by uuid references auth.users (id) on delete set null
);

comment on table public.clienti_possibili_promozioni is
  'Pratica di promozione lead→cliente innescata da fattura emessa. Completata solo dall’operatore in carico.';

create unique index if not exists cpp_open_lead_uidx
  on public.clienti_possibili_promozioni (cliente_possibile_id)
  where deleted_at is null and stato = 'aperta';

create index if not exists cpp_stato_idx
  on public.clienti_possibili_promozioni (stato, updated_at desc)
  where deleted_at is null;

drop trigger if exists cpp_updated_at on public.clienti_possibili_promozioni;
create trigger cpp_updated_at
  before update on public.clienti_possibili_promozioni
  for each row execute function public.set_updated_at();

alter table public.clienti_possibili_promozioni enable row level security;

drop policy if exists "cpp_select" on public.clienti_possibili_promozioni;
create policy "cpp_select"
  on public.clienti_possibili_promozioni for select
  to authenticated
  using (
    public.is_superadmin()
    or public.has_area_access('amministrazione')
    or public.has_area_access('commerciale')
  );

drop policy if exists "cpp_write" on public.clienti_possibili_promozioni;
create policy "cpp_write"
  on public.clienti_possibili_promozioni for insert
  to authenticated
  with check (
    public.is_superadmin()
    or public.has_area_access('amministrazione')
    or public.has_area_access('commerciale')
  );

drop policy if exists "cpp_update" on public.clienti_possibili_promozioni;
create policy "cpp_update"
  on public.clienti_possibili_promozioni for update
  to authenticated
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

grant select, insert, update on table public.clienti_possibili_promozioni
  to authenticated;
grant all on table public.clienti_possibili_promozioni
  to postgres, service_role;
revoke delete on table public.clienti_possibili_promozioni from authenticated;
