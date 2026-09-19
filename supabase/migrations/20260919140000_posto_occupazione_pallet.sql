-- Occupazione posto: pallet + elementi (ISO 9001).
-- Numeri univoci solo tra i record attivi: se l'elemento è rimosso il codice si riusa.
-- Soft delete, audit, niente delete fisico.

create table if not exists public.magazzino_posto_occupazioni (
  id uuid primary key default gen_random_uuid(),
  ubicazione_id uuid not null references public.magazzino_ubicazioni (id),
  tipo_elemento text not null,
  imballaggio_voce_id uuid references public.imballaggi_voci (id) on delete set null,
  imballaggio_nome text not null default '',
  quantita_elementi int,
  codice_pallet text not null,
  lotto_interno_codice text,
  lotto_esterno_id uuid references public.lotti_esterni (id) on delete set null,
  lotto_esterno_codice text,
  stato text not null default 'attivo',
  documento_stato text not null default 'bozza',
  versione int not null default 1,
  note text not null default '',
  created_by uuid references auth.users (id) on delete set null,
  updated_by uuid references auth.users (id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz,
  deleted_by uuid references auth.users (id) on delete set null,
  constraint mag_posto_occ_tipo_check check (tipo_elemento in ('isolamento', 'confezione')),
  constraint mag_posto_occ_stato_check check (stato in ('attivo', 'liberato')),
  constraint mag_posto_occ_doc_check check (documento_stato in ('bozza', 'approvato', 'chiuso')),
  constraint mag_posto_occ_qty_check check (
    quantita_elementi is null or quantita_elementi > 0
  )
);

create unique index if not exists mag_posto_occ_ubi_attiva_uidx
  on public.magazzino_posto_occupazioni (ubicazione_id)
  where deleted_at is null and stato = 'attivo';

create unique index if not exists mag_posto_occ_pallet_attivi_uidx
  on public.magazzino_posto_occupazioni (upper(codice_pallet))
  where deleted_at is null;

create index if not exists mag_posto_occ_ubi_idx
  on public.magazzino_posto_occupazioni (ubicazione_id)
  where deleted_at is null;

comment on table public.magazzino_posto_occupazioni is
  'Pallet/occupazione di un posto. Codice pallet univoco finché il record è attivo.';

drop trigger if exists mag_posto_occ_updated_at on public.magazzino_posto_occupazioni;
create trigger mag_posto_occ_updated_at
  before update on public.magazzino_posto_occupazioni
  for each row execute function public.set_updated_at();

create table if not exists public.magazzino_posto_elementi (
  id uuid primary key default gen_random_uuid(),
  occupazione_id uuid not null references public.magazzino_posto_occupazioni (id),
  numero text not null,
  peso_kg numeric(12, 3),
  scan_token text not null,
  sort_order int not null default 0,
  created_by uuid references auth.users (id) on delete set null,
  updated_by uuid references auth.users (id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz,
  deleted_by uuid references auth.users (id) on delete set null,
  constraint mag_posto_el_peso_check check (peso_kg is null or peso_kg > 0)
);

create unique index if not exists mag_posto_el_numero_attivi_uidx
  on public.magazzino_posto_elementi (upper(numero))
  where deleted_at is null;

create unique index if not exists mag_posto_el_token_uidx
  on public.magazzino_posto_elementi (scan_token)
  where deleted_at is null;

create index if not exists mag_posto_el_occ_idx
  on public.magazzino_posto_elementi (occupazione_id)
  where deleted_at is null;

comment on table public.magazzino_posto_elementi is
  'Elemento sul pallet (isolamento o confezione). Numero univoco solo tra gli attivi: se rimosso si riusa.';

drop trigger if exists mag_posto_el_updated_at on public.magazzino_posto_elementi;
create trigger mag_posto_el_updated_at
  before update on public.magazzino_posto_elementi
  for each row execute function public.set_updated_at();

alter table public.magazzino_posto_occupazioni enable row level security;
alter table public.magazzino_posto_elementi enable row level security;

drop policy if exists "mag_posto_occ_select" on public.magazzino_posto_occupazioni;
create policy "mag_posto_occ_select"
  on public.magazzino_posto_occupazioni for select
  to authenticated
  using (
    public.is_superadmin()
    or public.has_area_access('magazzino')
    or public.has_area_access('strumenti')
    or public.has_area_access('amministrazione')
  );

drop policy if exists "mag_posto_occ_write" on public.magazzino_posto_occupazioni;
create policy "mag_posto_occ_write"
  on public.magazzino_posto_occupazioni for insert
  to authenticated
  with check (
    public.is_superadmin()
    or public.has_area_access('magazzino')
    or public.has_area_access('amministrazione')
  );

drop policy if exists "mag_posto_occ_update" on public.magazzino_posto_occupazioni;
create policy "mag_posto_occ_update"
  on public.magazzino_posto_occupazioni for update
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

drop policy if exists "mag_posto_el_select" on public.magazzino_posto_elementi;
create policy "mag_posto_el_select"
  on public.magazzino_posto_elementi for select
  to authenticated
  using (
    public.is_superadmin()
    or public.has_area_access('magazzino')
    or public.has_area_access('strumenti')
    or public.has_area_access('amministrazione')
  );

drop policy if exists "mag_posto_el_write" on public.magazzino_posto_elementi;
create policy "mag_posto_el_write"
  on public.magazzino_posto_elementi for insert
  to authenticated
  with check (
    public.is_superadmin()
    or public.has_area_access('magazzino')
    or public.has_area_access('amministrazione')
  );

drop policy if exists "mag_posto_el_update" on public.magazzino_posto_elementi;
create policy "mag_posto_el_update"
  on public.magazzino_posto_elementi for update
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

grant select, insert, update on table public.magazzino_posto_occupazioni to authenticated;
grant select, insert, update on table public.magazzino_posto_elementi to authenticated;
grant all on table public.magazzino_posto_occupazioni to postgres, service_role;
grant all on table public.magazzino_posto_elementi to postgres, service_role;
revoke delete on table public.magazzino_posto_occupazioni from authenticated;
revoke delete on table public.magazzino_posto_elementi from authenticated;
