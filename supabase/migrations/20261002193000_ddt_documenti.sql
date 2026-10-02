-- DDT emessi e ricevuti, allineati a Fatture in Cloud (ISO 9001 7.5 / 8.5.2).
-- Non entrano in fatture_emesse / fatture_ricevute: non spostano il numero fattura né il registro IVA.

create table if not exists public.ddt_documenti (
  id uuid primary key default gen_random_uuid(),
  direzione text not null check (direzione in ('emesso', 'ricevuto')),
  fic_id bigint,
  numero_fic text not null default '',
  numero_interno text not null,
  cliente_id uuid references public.clienti (id) on delete set null,
  fornitore_id uuid references public.fornitori (id) on delete set null,
  ragione_sociale text not null,
  partita_iva text not null default '',
  data_documento date not null,
  causale_trasporto text not null default '',
  destinazione text not null default '',
  imponibile numeric(14, 2) not null default 0,
  imposta numeric(14, 2) not null default 0,
  totale numeric(14, 2) not null default 0,
  stato text not null default 'registrato'
    check (stato in ('bozza', 'registrato', 'annullato')),
  versione integer not null default 1,
  note text not null default '',
  pdf_url text not null default '',
  raw_data jsonb not null default '{}'::jsonb,
  created_by uuid references auth.users (id) on delete set null,
  updated_by uuid references auth.users (id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz,
  deleted_by uuid references auth.users (id) on delete set null
);

create unique index if not exists ddt_documenti_fic_uidx
  on public.ddt_documenti (direzione, fic_id)
  where deleted_at is null and fic_id is not null;

create unique index if not exists ddt_documenti_numero_uidx
  on public.ddt_documenti (direzione, numero_interno)
  where deleted_at is null;

create index if not exists ddt_documenti_data_idx
  on public.ddt_documenti (direzione, data_documento desc)
  where deleted_at is null;

comment on table public.ddt_documenti is
  'Documenti di trasporto emessi e ricevuti, sincronizzati con Fatture in Cloud.';

drop trigger if exists ddt_documenti_updated_at on public.ddt_documenti;
create trigger ddt_documenti_updated_at
  before update on public.ddt_documenti
  for each row execute function public.set_updated_at();

create table if not exists public.ddt_righe (
  id uuid primary key default gen_random_uuid(),
  ddt_id uuid not null references public.ddt_documenti (id),
  sort_order integer not null default 0,
  codice text not null default '',
  descrizione text not null,
  quantita numeric(14, 3) not null default 1,
  prezzo_unitario numeric(14, 4) not null default 0,
  sconto_percentuale numeric(6, 2) not null default 0,
  iva_percentuale numeric(5, 2) not null default 0,
  importo numeric(14, 2) not null default 0,
  created_by uuid references auth.users (id) on delete set null,
  updated_by uuid references auth.users (id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz,
  deleted_by uuid references auth.users (id) on delete set null
);

create index if not exists ddt_righe_ddt_idx
  on public.ddt_righe (ddt_id, sort_order)
  where deleted_at is null;

drop trigger if exists ddt_righe_updated_at on public.ddt_righe;
create trigger ddt_righe_updated_at
  before update on public.ddt_righe
  for each row execute function public.set_updated_at();

alter table public.ddt_documenti enable row level security;
alter table public.ddt_righe enable row level security;

drop policy if exists ddt_documenti_select on public.ddt_documenti;
create policy ddt_documenti_select
  on public.ddt_documenti for select to authenticated
  using (public.has_area_access('area-fiscale') or public.is_superadmin());

drop policy if exists ddt_documenti_insert on public.ddt_documenti;
create policy ddt_documenti_insert
  on public.ddt_documenti for insert to authenticated
  with check (public.has_area_access('area-fiscale') or public.is_superadmin());

drop policy if exists ddt_documenti_update on public.ddt_documenti;
create policy ddt_documenti_update
  on public.ddt_documenti for update to authenticated
  using (public.has_area_access('area-fiscale') or public.is_superadmin())
  with check (public.has_area_access('area-fiscale') or public.is_superadmin());

drop policy if exists ddt_righe_select on public.ddt_righe;
create policy ddt_righe_select
  on public.ddt_righe for select to authenticated
  using (public.has_area_access('area-fiscale') or public.is_superadmin());

drop policy if exists ddt_righe_insert on public.ddt_righe;
create policy ddt_righe_insert
  on public.ddt_righe for insert to authenticated
  with check (public.has_area_access('area-fiscale') or public.is_superadmin());

drop policy if exists ddt_righe_update on public.ddt_righe;
create policy ddt_righe_update
  on public.ddt_righe for update to authenticated
  using (public.has_area_access('area-fiscale') or public.is_superadmin())
  with check (public.has_area_access('area-fiscale') or public.is_superadmin());

grant select, insert, update on table public.ddt_documenti to authenticated;
grant select, insert, update on table public.ddt_righe to authenticated;
grant all on table public.ddt_documenti to postgres, service_role;
grant all on table public.ddt_righe to postgres, service_role;
revoke delete on table public.ddt_documenti from authenticated, anon;
revoke delete on table public.ddt_righe from authenticated, anon;
