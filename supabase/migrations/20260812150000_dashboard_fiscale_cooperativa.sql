-- Dashboard fiscale / Commercialista interattivo
-- Profilo Cooperativa Agricola e Sociale A.R.L. + adempimenti + snapshot audit ISO 9001

-- ---------------------------------------------------------------------------
-- company_fiscal_profile (singola azienda)
-- ---------------------------------------------------------------------------
create table if not exists public.company_fiscal_profile (
  id uuid primary key default gen_random_uuid(),
  company_key text not null default 'default',
  forma_giuridica text not null default 'cooperativa_agricola_sociale_arl',
  regime_iva text not null default 'speciale_agricolo_art34',
  iva_periodo text not null default 'trimestrale',
  cooperativa_sociale_l381 boolean not null default true,
  zona_svantaggiata boolean not null default false,
  otd_count integer not null default 0,
  oti_count integer not null default 0,
  -- Tabelle percentuali compensazione / aliquote per tipo coltura-prodotto
  tipi_colture jsonb not null default '[
    {"codice":"fresco","label":"Prodotti freschi","percentuale_compensazione":4,"aliquota_iva":4},
    {"codice":"trasformato","label":"Prodotti trasformati","percentuale_compensazione":0,"aliquota_iva":10}
  ]'::jsonb,
  -- Coefficienti/parametri INPS agricoli (override manuale)
  inps_parametri jsonb not null default '{
    "contribuzione_otd_pct": 0,
    "contribuzione_oti_pct": 0,
    "sgravio_zona_svantaggiata_pct": 0,
    "stima_mensile_fissa_eur": 0
  }'::jsonb,
  -- Stime IRES/IRAP (agevolazioni cooperativa sociale configurabili)
  aliquota_ires_pct numeric(6, 3) not null default 12,
  aliquota_irap_pct numeric(6, 3) not null default 3.9,
  aliquota_stima_generica_pct numeric(6, 3) not null default 24,
  note text not null default '',
  open_data_enabled boolean not null default false,
  open_data_last_sync_at timestamptz,
  open_data_last_payload jsonb not null default '{}'::jsonb,
  versione integer not null default 1,
  created_by uuid references auth.users (id) on delete set null,
  updated_by uuid references auth.users (id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz,
  deleted_by uuid references auth.users (id) on delete set null,
  constraint company_fiscal_profile_forma_check check (
    forma_giuridica in ('cooperativa_agricola_sociale_arl')
  ),
  constraint company_fiscal_profile_regime_check check (
    regime_iva in ('ordinario', 'speciale_agricolo_art34')
  ),
  constraint company_fiscal_profile_periodo_check check (
    iva_periodo in ('mensile', 'trimestrale')
  ),
  constraint company_fiscal_profile_otd_check check (otd_count >= 0),
  constraint company_fiscal_profile_oti_check check (oti_count >= 0)
);

comment on table public.company_fiscal_profile is
  'Profilo fiscale aziendale (Cooperativa Agricola e Sociale A.R.L.) — parametri override manuale ISO 9001';

create unique index if not exists company_fiscal_profile_company_key_active_uidx
  on public.company_fiscal_profile (company_key)
  where deleted_at is null;

drop trigger if exists company_fiscal_profile_updated_at on public.company_fiscal_profile;
create trigger company_fiscal_profile_updated_at
  before update on public.company_fiscal_profile
  for each row execute function public.set_updated_at();

alter table public.company_fiscal_profile enable row level security;

drop policy if exists "company_fiscal_profile_select" on public.company_fiscal_profile;
create policy "company_fiscal_profile_select"
  on public.company_fiscal_profile for select to authenticated
  using (
    public.has_area_access('amministrazione')
    or public.has_area_access('impostazioni')
    or public.is_superadmin()
  );

drop policy if exists "company_fiscal_profile_insert" on public.company_fiscal_profile;
create policy "company_fiscal_profile_insert"
  on public.company_fiscal_profile for insert to authenticated
  with check (public.is_superadmin() or public.has_area_access('impostazioni'));

drop policy if exists "company_fiscal_profile_update" on public.company_fiscal_profile;
create policy "company_fiscal_profile_update"
  on public.company_fiscal_profile for update to authenticated
  using (public.is_superadmin() or public.has_area_access('impostazioni'))
  with check (public.is_superadmin() or public.has_area_access('impostazioni'));

grant select, insert, update on table public.company_fiscal_profile to authenticated;
grant all on table public.company_fiscal_profile to postgres, service_role;

-- Seed profilo default
insert into public.company_fiscal_profile (
  company_key,
  forma_giuridica,
  regime_iva,
  iva_periodo,
  cooperativa_sociale_l381,
  note
)
select
  'default',
  'cooperativa_agricola_sociale_arl',
  'speciale_agricolo_art34',
  'trimestrale',
  true,
  'Profilo iniziale Cooperativa Agricola e Sociale A.R.L. — parametri modificabili da Impostazioni.'
where not exists (
  select 1 from public.company_fiscal_profile
  where company_key = 'default' and deleted_at is null
);

-- ---------------------------------------------------------------------------
-- company_fiscal_profile_audit (immutabile — reason_for_change)
-- ---------------------------------------------------------------------------
create table if not exists public.company_fiscal_profile_audit (
  id uuid primary key default gen_random_uuid(),
  profile_id uuid not null references public.company_fiscal_profile (id) on delete cascade,
  changed_at timestamptz not null default now(),
  changed_by uuid references auth.users (id) on delete set null,
  reason_for_change text not null,
  previous_payload jsonb not null default '{}'::jsonb,
  next_payload jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

comment on table public.company_fiscal_profile_audit is
  'Log immutabile modifiche parametri fiscali (ISO 9001 tracciabilità regole di calcolo)';

create index if not exists company_fiscal_profile_audit_profile_idx
  on public.company_fiscal_profile_audit (profile_id, changed_at desc);

alter table public.company_fiscal_profile_audit enable row level security;

drop policy if exists "company_fiscal_profile_audit_select" on public.company_fiscal_profile_audit;
create policy "company_fiscal_profile_audit_select"
  on public.company_fiscal_profile_audit for select to authenticated
  using (
    public.has_area_access('amministrazione')
    or public.has_area_access('impostazioni')
    or public.is_superadmin()
  );

drop policy if exists "company_fiscal_profile_audit_insert" on public.company_fiscal_profile_audit;
create policy "company_fiscal_profile_audit_insert"
  on public.company_fiscal_profile_audit for insert to authenticated
  with check (public.is_superadmin() or public.has_area_access('impostazioni'));

-- Nessun update/delete: append-only
grant select, insert on table public.company_fiscal_profile_audit to authenticated;
grant all on table public.company_fiscal_profile_audit to postgres, service_role;

-- ---------------------------------------------------------------------------
-- fiscal_open_data_cache (parametri ufficiali AdE/INPS — predisposizione)
-- ---------------------------------------------------------------------------
create table if not exists public.fiscal_open_data_cache (
  id uuid primary key default gen_random_uuid(),
  source_key text not null,
  source_label text not null default '',
  source_url text not null default '',
  fetched_at timestamptz not null default now(),
  payload jsonb not null default '{}'::jsonb,
  note text not null default '',
  created_by uuid references auth.users (id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint fiscal_open_data_cache_source_key_uidx unique (source_key)
);

comment on table public.fiscal_open_data_cache is
  'Cache parametri open data Agenzia Entrate / INPS agricolo (sincronizzabile via API)';

drop trigger if exists fiscal_open_data_cache_updated_at on public.fiscal_open_data_cache;
create trigger fiscal_open_data_cache_updated_at
  before update on public.fiscal_open_data_cache
  for each row execute function public.set_updated_at();

alter table public.fiscal_open_data_cache enable row level security;

drop policy if exists "fiscal_open_data_cache_select" on public.fiscal_open_data_cache;
create policy "fiscal_open_data_cache_select"
  on public.fiscal_open_data_cache for select to authenticated
  using (
    public.has_area_access('amministrazione')
    or public.has_area_access('impostazioni')
    or public.is_superadmin()
  );

drop policy if exists "fiscal_open_data_cache_write" on public.fiscal_open_data_cache;
create policy "fiscal_open_data_cache_write"
  on public.fiscal_open_data_cache for all to authenticated
  using (public.is_superadmin() or public.has_area_access('impostazioni'))
  with check (public.is_superadmin() or public.has_area_access('impostazioni'));

grant select, insert, update, delete on table public.fiscal_open_data_cache to authenticated;
grant all on table public.fiscal_open_data_cache to postgres, service_role;

insert into public.fiscal_open_data_cache (source_key, source_label, source_url, note, payload)
values
  (
    'ade_compensazione_agricola',
    'Agenzia Entrate — percentuali compensazione art. 34',
    'https://www.agenziaentrate.gov.it',
    'Placeholder open data: sostituire con feed ufficiale / sync API.',
    '{"stato":"placeholder","aliquote":[]}'::jsonb
  ),
  (
    'inps_agricolo',
    'INPS — contribuzione agricola OTD/OTI',
    'https://www.inps.it',
    'Placeholder open data: sostituire con feed ufficiale / sync API.',
    '{"stato":"placeholder","parametri":{}}'::jsonb
  )
on conflict (source_key) do nothing;

-- ---------------------------------------------------------------------------
-- adempimenti_fiscali
-- ---------------------------------------------------------------------------
create table if not exists public.adempimenti_fiscali (
  id uuid primary key default gen_random_uuid(),
  codice text not null default '',
  titolo text not null,
  descrizione text not null default '',
  categoria text not null default 'altro',
  ricorrenza text not null default 'mensile',
  giorno_mese integer,
  mese_anno integer,
  attivo boolean not null default true,
  sort_order integer not null default 0,
  created_by uuid references auth.users (id) on delete set null,
  updated_by uuid references auth.users (id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz,
  deleted_by uuid references auth.users (id) on delete set null,
  constraint adempimenti_fiscali_categoria_check check (
    categoria in ('iva', 'inps', 'ires', 'irap', 'f24', 'altro')
  ),
  constraint adempimenti_fiscali_ricorrenza_check check (
    ricorrenza in ('mensile', 'trimestrale', 'annuale', 'una_tantum')
  ),
  constraint adempimenti_fiscali_giorno_check check (
    giorno_mese is null or (giorno_mese >= 1 and giorno_mese <= 31)
  ),
  constraint adempimenti_fiscali_mese_check check (
    mese_anno is null or (mese_anno >= 1 and mese_anno <= 12)
  )
);

comment on table public.adempimenti_fiscali is
  'Adempimenti fiscali ricorrenti (F24 IVA, INPS, acconti/saldi) — soft delete';

create index if not exists adempimenti_fiscali_active_idx
  on public.adempimenti_fiscali (attivo, sort_order)
  where deleted_at is null;

drop trigger if exists adempimenti_fiscali_updated_at on public.adempimenti_fiscali;
create trigger adempimenti_fiscali_updated_at
  before update on public.adempimenti_fiscali
  for each row execute function public.set_updated_at();

alter table public.adempimenti_fiscali enable row level security;

drop policy if exists "adempimenti_fiscali_select" on public.adempimenti_fiscali;
create policy "adempimenti_fiscali_select"
  on public.adempimenti_fiscali for select to authenticated
  using (public.has_area_access('amministrazione') or public.is_superadmin());

drop policy if exists "adempimenti_fiscali_write" on public.adempimenti_fiscali;
create policy "adempimenti_fiscali_write"
  on public.adempimenti_fiscali for all to authenticated
  using (public.has_area_access('amministrazione') or public.is_superadmin())
  with check (public.has_area_access('amministrazione') or public.is_superadmin());

grant select, insert, update, delete on table public.adempimenti_fiscali to authenticated;
grant all on table public.adempimenti_fiscali to postgres, service_role;

insert into public.adempimenti_fiscali (codice, titolo, descrizione, categoria, ricorrenza, giorno_mese, sort_order)
select * from (values
  ('F24_IVA', 'F24 IVA', 'Versamento liquidazione IVA (indicativamente il 16 del mese successivo)', 'f24', 'mensile', 16, 10),
  ('INPS_AGR', 'Contributi INPS agricoli', 'Adempimenti contributivi OTD/OTI (parametri da profilo fiscale)', 'inps', 'mensile', 16, 20),
  ('ACC_IRES', 'Acconto/saldo IRES', 'Acconti e saldo IRES cooperativa (L. 381/91 se qualificata)', 'ires', 'annuale', 30, 30),
  ('ACC_IRAP', 'Acconto/saldo IRAP', 'Acconti e saldo IRAP', 'irap', 'annuale', 30, 40)
) as v(codice, titolo, descrizione, categoria, ricorrenza, giorno_mese, sort_order)
where not exists (
  select 1 from public.adempimenti_fiscali a where a.codice = v.codice and a.deleted_at is null
);

-- ---------------------------------------------------------------------------
-- dashboard_fiscale_snapshots (consultazione/report immutabile)
-- ---------------------------------------------------------------------------
create table if not exists public.dashboard_fiscale_snapshots (
  id uuid primary key default gen_random_uuid(),
  periodo_tipo text not null,
  periodo_label text not null,
  periodo_dal date not null,
  periodo_al date not null,
  payload jsonb not null,
  profilo_versione integer not null default 1,
  note text not null default '',
  created_by uuid references auth.users (id) on delete set null,
  created_at timestamptz not null default now(),
  constraint dashboard_fiscale_snapshots_periodo_tipo_check check (
    periodo_tipo in ('mese', 'trimestre', 'anno', 'custom')
  )
);

comment on table public.dashboard_fiscale_snapshots is
  'Snapshot report fiscale consultati/salvati — audit created_by/created_at (ISO 9001)';

create index if not exists dashboard_fiscale_snapshots_created_idx
  on public.dashboard_fiscale_snapshots (created_at desc);

alter table public.dashboard_fiscale_snapshots enable row level security;

drop policy if exists "dashboard_fiscale_snapshots_select" on public.dashboard_fiscale_snapshots;
create policy "dashboard_fiscale_snapshots_select"
  on public.dashboard_fiscale_snapshots for select to authenticated
  using (public.has_area_access('amministrazione') or public.is_superadmin());

drop policy if exists "dashboard_fiscale_snapshots_insert" on public.dashboard_fiscale_snapshots;
create policy "dashboard_fiscale_snapshots_insert"
  on public.dashboard_fiscale_snapshots for insert to authenticated
  with check (public.has_area_access('amministrazione') or public.is_superadmin());

grant select, insert on table public.dashboard_fiscale_snapshots to authenticated;
grant all on table public.dashboard_fiscale_snapshots to postgres, service_role;
