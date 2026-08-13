-- Ordini: consegna/capacità + schema produzione definitivo (ML-ready) — ISO 9001
-- Tabelle strutturali definitive; dati operativi di test eliminabili (is_test + soft delete)

-- ---------------------------------------------------------------------------
-- Audit: nuove action
-- ---------------------------------------------------------------------------
alter table public.audit_log drop constraint if exists audit_log_action_check;
alter table public.audit_log
  add constraint audit_log_action_check check (
    action in (
      'create',
      'update',
      'soft_delete',
      'restore',
      'status_change',
      'attachment_upload',
      'attachment_remove',
      'purge_test_ordini',
      'rinumera_per_data_emissione',
      'create_nota_credito',
      'annulla_dilazioni_da_nc',
      'collega_fattura_compensativa'
    )
  );

-- ---------------------------------------------------------------------------
-- Ordini: campi consegna / capacità / test
-- ---------------------------------------------------------------------------
alter table public.ordini
  add column if not exists consegna_tipo text,
  add column if not exists urgente boolean not null default false,
  add column if not exists usa_magazzino boolean not null default false,
  add column if not exists usa_sabato boolean not null default false,
  add column if not exists data_consegna_stimata date,
  add column if not exists capacita_snapshot jsonb not null default '{}'::jsonb,
  add column if not exists is_test boolean not null default true;

alter table public.ordini drop constraint if exists ordini_consegna_tipo_check;
alter table public.ordini
  add constraint ordini_consegna_tipo_check
  check (consegna_tipo is null or consegna_tipo in ('asap', 'data'));

comment on column public.ordini.consegna_tipo is
  'asap = prima possibile | data = data scelta operatore';
comment on column public.ordini.usa_magazzino is
  'Se true la pianificazione usa giacenza (anche per rimpiazzo fresco)';
comment on column public.ordini.usa_sabato is
  'Se true (urgente) include sabato tra le giornate produttive';
comment on column public.ordini.capacita_snapshot is
  'Snapshot calcolo capacità al salvataggio (audit / ML futuro)';
comment on column public.ordini.is_test is
  'Dati di prova eliminabili con purge area ordini';

create index if not exists ordini_is_test_idx
  on public.ordini (is_test)
  where deleted_at is null;

-- ---------------------------------------------------------------------------
-- Linea produttiva: secco (ODR/NDR) vs gel (OGL/NGL)
-- ---------------------------------------------------------------------------
create table if not exists public.produzione_linee (
  id uuid primary key default gen_random_uuid(),
  codice text not null,
  nome text not null,
  prefissi_prodotto text[] not null default '{}',
  -- secco: capacità da essiccatori attivi; gel: percorso dedicato (override kg/giorno ingresso)
  usa_essiccatori boolean not null default true,
  capacita_ingresso_giornaliera_kg numeric(14, 2),
  note text not null default '',
  created_by uuid references auth.users (id) on delete set null,
  updated_by uuid references auth.users (id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz,
  deleted_by uuid references auth.users (id) on delete set null,
  constraint produzione_linee_codice_check check (codice in ('secco', 'gel')),
  constraint produzione_linee_cap_gel_check check (
    usa_essiccatori
    or (capacita_ingresso_giornaliera_kg is not null and capacita_ingresso_giornaliera_kg > 0)
  )
);

create unique index if not exists produzione_linee_codice_uidx
  on public.produzione_linee (codice)
  where deleted_at is null;

comment on table public.produzione_linee is
  'Linee produttive: secco (ODR/NDR) e gel (OGL/NGL) — base per capacità e ML rese';

drop trigger if exists produzione_linee_updated_at on public.produzione_linee;
create trigger produzione_linee_updated_at
  before update on public.produzione_linee
  for each row execute function public.set_updated_at();

alter table public.produzione_linee enable row level security;
drop policy if exists "produzione_linee_all" on public.produzione_linee;
create policy "produzione_linee_all"
  on public.produzione_linee for all to authenticated
  using (public.has_area_access('amministrazione') or public.is_superadmin())
  with check (public.has_area_access('amministrazione') or public.is_superadmin());
grant select, insert, update, delete on table public.produzione_linee to authenticated;
grant all on table public.produzione_linee to postgres, service_role;

insert into public.produzione_linee (
  codice, nome, prefissi_prodotto, usa_essiccatori, capacita_ingresso_giornaliera_kg, note
)
select v.codice, v.nome, v.prefissi, v.usa_essiccatori, v.cap_kg, v.note
from (values
  (
    'secco',
    'Prodotto secco / disidratato',
    array['ODR', 'NDR']::text[],
    true,
    null::numeric,
    'Resa essiccazione: inverno ~7,5–8%, estate ~10–11% sul carico cladodi. Capacità = essiccatori attivi × 2200 kg × resa%.'
  ),
  (
    'gel',
    'Gel estratto',
    array['OGL', 'NGL']::text[],
    false,
    4400::numeric,
    'Percorso OGL/NGL distinto dagli essiccatori. Capacità ingresso giornaliera configurabile (default allineato a 2×2200 finché non calibrata da dati reali/ML). Resa inversa al secco.'
  )
) as v(codice, nome, prefissi, usa_essiccatori, cap_kg, note)
where not exists (
  select 1 from public.produzione_linee l
  where l.codice = v.codice and l.deleted_at is null
);

-- ---------------------------------------------------------------------------
-- Essiccatori (asset): capacità ingresso max kg — oggi 2, target 5–6 entro 2027
-- ---------------------------------------------------------------------------
create table if not exists public.produzione_essiccatori (
  id uuid primary key default gen_random_uuid(),
  codice text not null,
  nome text not null,
  capacita_ingresso_kg numeric(14, 2) not null default 2200,
  attivo boolean not null default true,
  data_installazione date,
  data_prevista_attivazione date,
  note text not null default '',
  created_by uuid references auth.users (id) on delete set null,
  updated_by uuid references auth.users (id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz,
  deleted_by uuid references auth.users (id) on delete set null,
  constraint produzione_essiccatori_cap_check check (capacita_ingresso_kg > 0)
);

create unique index if not exists produzione_essiccatori_codice_uidx
  on public.produzione_essiccatori (codice)
  where deleted_at is null;

comment on table public.produzione_essiccatori is
  'Essiccatori: carico max ingresso (default 2200 kg). Capacità output = ingresso × resa periodo';

drop trigger if exists produzione_essiccatori_updated_at on public.produzione_essiccatori;
create trigger produzione_essiccatori_updated_at
  before update on public.produzione_essiccatori
  for each row execute function public.set_updated_at();

alter table public.produzione_essiccatori enable row level security;
drop policy if exists "produzione_essiccatori_all" on public.produzione_essiccatori;
create policy "produzione_essiccatori_all"
  on public.produzione_essiccatori for all to authenticated
  using (public.has_area_access('amministrazione') or public.is_superadmin())
  with check (public.has_area_access('amministrazione') or public.is_superadmin());
grant select, insert, update, delete on table public.produzione_essiccatori to authenticated;
grant all on table public.produzione_essiccatori to postgres, service_role;

insert into public.produzione_essiccatori (
  codice, nome, capacita_ingresso_kg, attivo, data_installazione, data_prevista_attivazione, note
)
select v.codice, v.nome, 2200, v.attivo, v.data_inst, v.data_prev, v.note
from (values
  ('ESS-01', 'Essiccatore 1', true, current_date, null::date,
   'Installato — fase attuale (2 unità attive)'),
  ('ESS-02', 'Essiccatore 2', true, current_date, null::date,
   'Installato — fase attuale (2 unità attive)'),
  ('ESS-03', 'Essiccatore 3 (previsto)', false, null::date, date '2027-06-30',
   'Piano ampliamento: attivazione entro fine 2027'),
  ('ESS-04', 'Essiccatore 4 (previsto)', false, null::date, date '2027-09-30',
   'Piano ampliamento: attivazione entro fine 2027'),
  ('ESS-05', 'Essiccatore 5 (previsto)', false, null::date, date '2027-12-31',
   'Piano ampliamento: attivazione entro fine 2027'),
  ('ESS-06', 'Essiccatore 6 (previsto)', false, null::date, date '2027-12-31',
   'Opzionale 6ª unità entro fine 2027')
) as v(codice, nome, attivo, data_inst, data_prev, note)
where not exists (
  select 1 from public.produzione_essiccatori e
  where e.codice = v.codice and e.deleted_at is null
);

-- ---------------------------------------------------------------------------
-- Rese di baseline per periodo (punto di partenza; ML affinerà con osservazioni)
-- ---------------------------------------------------------------------------
create table if not exists public.produzione_resa_baseline (
  id uuid primary key default gen_random_uuid(),
  linea_codice text not null,
  stagione text not null,
  mese_da integer not null,
  mese_a integer not null,
  resa_percentuale_min numeric(8, 4) not null,
  resa_percentuale_max numeric(8, 4) not null,
  resa_percentuale_media numeric(8, 4) not null,
  note text not null default '',
  versione integer not null default 1,
  created_by uuid references auth.users (id) on delete set null,
  updated_by uuid references auth.users (id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz,
  deleted_by uuid references auth.users (id) on delete set null,
  constraint produzione_resa_stagione_check check (stagione in ('inverno', 'estate')),
  constraint produzione_resa_mesi_check check (
    mese_da between 1 and 12 and mese_a between 1 and 12
  ),
  constraint produzione_resa_pct_check check (
    resa_percentuale_min > 0
    and resa_percentuale_max >= resa_percentuale_min
    and resa_percentuale_media between resa_percentuale_min and resa_percentuale_max
  )
);

comment on table public.produzione_resa_baseline is
  'Rese % baseline per linea/stagione. ML sostituirà/affinerà con medie reali';

create index if not exists produzione_resa_baseline_linea_idx
  on public.produzione_resa_baseline (linea_codice, stagione)
  where deleted_at is null;

drop trigger if exists produzione_resa_baseline_updated_at on public.produzione_resa_baseline;
create trigger produzione_resa_baseline_updated_at
  before update on public.produzione_resa_baseline
  for each row execute function public.set_updated_at();

alter table public.produzione_resa_baseline enable row level security;
drop policy if exists "produzione_resa_baseline_all" on public.produzione_resa_baseline;
create policy "produzione_resa_baseline_all"
  on public.produzione_resa_baseline for all to authenticated
  using (public.has_area_access('amministrazione') or public.is_superadmin())
  with check (public.has_area_access('amministrazione') or public.is_superadmin());
grant select, insert, update, delete on table public.produzione_resa_baseline to authenticated;
grant all on table public.produzione_resa_baseline to postgres, service_role;

insert into public.produzione_resa_baseline (
  linea_codice, stagione, mese_da, mese_a,
  resa_percentuale_min, resa_percentuale_max, resa_percentuale_media, note
)
select * from (values
  ('secco', 'inverno', 11, 3, 7.5000, 8.0000, 7.7500,
   'Cladodi carichi d''acqua — resa disidratata più bassa'),
  ('secco', 'estate', 4, 10, 10.0000, 11.0000, 10.5000,
   'Periodo estivo — resa disidratata più alta'),
  ('gel', 'inverno', 11, 3, 10.0000, 11.0000, 10.5000,
   'Gel: comportamento inverso al secco (inverno più favorevole)'),
  ('gel', 'estate', 4, 10, 7.5000, 8.0000, 7.7500,
   'Gel: estate meno favorevole rispetto all''inverno')
) as v(linea_codice, stagione, mese_da, mese_a, rmin, rmax, rmed, note)
where not exists (
  select 1 from public.produzione_resa_baseline b
  where b.linea_codice = v.linea_codice
    and b.stagione = v.stagione
    and b.deleted_at is null
);

-- ---------------------------------------------------------------------------
-- Osservazioni giornaliere ingresso/uscita (apprendimento ML)
-- ---------------------------------------------------------------------------
create table if not exists public.produzione_resa_osservazioni (
  id uuid primary key default gen_random_uuid(),
  data_lavorazione date not null,
  linea_codice text not null,
  essiccatore_id uuid references public.produzione_essiccatori (id) on delete set null,
  prodotto_id uuid references public.prodotti_propri (id) on delete set null,
  prodotto_codice text not null default '',
  kg_ingresso numeric(14, 3) not null default 0,
  kg_uscita numeric(14, 3) not null default 0,
  resa_percentuale numeric(8, 4),
  note text not null default '',
  is_test boolean not null default true,
  created_by uuid references auth.users (id) on delete set null,
  updated_by uuid references auth.users (id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz,
  deleted_by uuid references auth.users (id) on delete set null,
  constraint produzione_resa_oss_kg_check check (kg_ingresso >= 0 and kg_uscita >= 0)
);

comment on table public.produzione_resa_osservazioni is
  'Registrazioni giornaliere ingresso/uscita — fonte dati per media reale / ML rese';

create index if not exists produzione_resa_oss_data_idx
  on public.produzione_resa_osservazioni (data_lavorazione desc)
  where deleted_at is null;

drop trigger if exists produzione_resa_osservazioni_updated_at on public.produzione_resa_osservazioni;
create trigger produzione_resa_osservazioni_updated_at
  before update on public.produzione_resa_osservazioni
  for each row execute function public.set_updated_at();

alter table public.produzione_resa_osservazioni enable row level security;
drop policy if exists "produzione_resa_osservazioni_all" on public.produzione_resa_osservazioni;
create policy "produzione_resa_osservazioni_all"
  on public.produzione_resa_osservazioni for all to authenticated
  using (public.has_area_access('amministrazione') or public.is_superadmin())
  with check (public.has_area_access('amministrazione') or public.is_superadmin());
grant select, insert, update, delete on table public.produzione_resa_osservazioni to authenticated;
grant all on table public.produzione_resa_osservazioni to postgres, service_role;

-- ---------------------------------------------------------------------------
-- Magazzino giacenze + movimenti (salvataggio giornaliero produzione)
-- ---------------------------------------------------------------------------
create table if not exists public.magazzino_giacenze (
  id uuid primary key default gen_random_uuid(),
  prodotto_id uuid not null references public.prodotti_propri (id) on delete restrict,
  prodotto_codice text not null default '',
  quantita_kg numeric(14, 3) not null default 0,
  is_test boolean not null default true,
  created_by uuid references auth.users (id) on delete set null,
  updated_by uuid references auth.users (id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz,
  deleted_by uuid references auth.users (id) on delete set null,
  constraint magazzino_giacenze_qty_check check (quantita_kg >= 0)
);

create unique index if not exists magazzino_giacenze_prodotto_uidx
  on public.magazzino_giacenze (prodotto_id)
  where deleted_at is null;

comment on table public.magazzino_giacenze is
  'Giacenza corrente per prodotto proprio (kg) — aggiornata dai movimenti produzione';

drop trigger if exists magazzino_giacenze_updated_at on public.magazzino_giacenze;
create trigger magazzino_giacenze_updated_at
  before update on public.magazzino_giacenze
  for each row execute function public.set_updated_at();

alter table public.magazzino_giacenze enable row level security;
drop policy if exists "magazzino_giacenze_all" on public.magazzino_giacenze;
create policy "magazzino_giacenze_all"
  on public.magazzino_giacenze for all to authenticated
  using (public.has_area_access('amministrazione') or public.is_superadmin())
  with check (public.has_area_access('amministrazione') or public.is_superadmin());
grant select, insert, update, delete on table public.magazzino_giacenze to authenticated;
grant all on table public.magazzino_giacenze to postgres, service_role;

create table if not exists public.magazzino_movimenti (
  id uuid primary key default gen_random_uuid(),
  data_movimento date not null default current_date,
  prodotto_id uuid references public.prodotti_propri (id) on delete set null,
  prodotto_codice text not null default '',
  tipo text not null,
  quantita_kg numeric(14, 3) not null,
  riferimento text not null default '',
  note text not null default '',
  is_test boolean not null default true,
  created_by uuid references auth.users (id) on delete set null,
  updated_by uuid references auth.users (id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz,
  deleted_by uuid references auth.users (id) on delete set null,
  constraint magazzino_movimenti_tipo_check check (
    tipo in ('ingresso_produzione', 'uscita_produzione', 'carico', 'scarico', 'rettifica')
  ),
  constraint magazzino_movimenti_qty_check check (quantita_kg <> 0)
);

comment on table public.magazzino_movimenti is
  'Movimenti magazzino giornalieri (ingresso/uscita produzione) — audit + fonte ML';

create index if not exists magazzino_movimenti_data_idx
  on public.magazzino_movimenti (data_movimento desc)
  where deleted_at is null;

drop trigger if exists magazzino_movimenti_updated_at on public.magazzino_movimenti;
create trigger magazzino_movimenti_updated_at
  before update on public.magazzino_movimenti
  for each row execute function public.set_updated_at();

alter table public.magazzino_movimenti enable row level security;
drop policy if exists "magazzino_movimenti_all" on public.magazzino_movimenti;
create policy "magazzino_movimenti_all"
  on public.magazzino_movimenti for all to authenticated
  using (public.has_area_access('amministrazione') or public.is_superadmin())
  with check (public.has_area_access('amministrazione') or public.is_superadmin());
grant select, insert, update, delete on table public.magazzino_movimenti to authenticated;
grant all on table public.magazzino_movimenti to postgres, service_role;
