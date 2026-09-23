-- Schede ordini + timeline + archivio lavorazioni scaletta (ISO 9001 §7.5 / 8.5.2)

alter table public.produzione_calendario_impegni
  add column if not exists archiviata_at timestamptz,
  add column if not exists archiviata_by uuid references auth.users (id) on delete set null;

create index if not exists produzione_cal_impegni_archivio_idx
  on public.produzione_calendario_impegni (data_giorno)
  where deleted_at is null and archiviata_at is not null;

create index if not exists produzione_cal_impegni_operativa_idx
  on public.produzione_calendario_impegni (data_giorno)
  where deleted_at is null and archiviata_at is null;

create table if not exists public.produzione_schede_ordini (
  id uuid primary key default gen_random_uuid(),
  ordine_id uuid references public.ordini (id) on delete set null,
  campionatura_id uuid references public.campionature (id) on delete set null,
  numero_scheda text not null,
  cliente text not null default '',
  prodotto text not null default '',
  entity_tipo text not null default 'ordine',
  scheda_stato text not null default 'aperta',
  documento_stato text not null default 'approvato',
  versione integer not null default 1,
  aperta_at timestamptz not null default now(),
  completata_at timestamptz,
  completata_by uuid references auth.users (id) on delete set null,
  archiviata_at timestamptz,
  archiviata_by uuid references auth.users (id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  created_by uuid references auth.users (id) on delete set null,
  updated_by uuid references auth.users (id) on delete set null,
  deleted_at timestamptz,
  deleted_by uuid references auth.users (id) on delete set null,
  constraint produzione_schede_ordini_entity_check check (
    (ordine_id is not null and campionatura_id is null)
    or (ordine_id is null and campionatura_id is not null)
  ),
  constraint produzione_schede_ordini_stato_check check (
    scheda_stato in ('aperta', 'completa', 'archiviata')
  ),
  constraint produzione_schede_ordini_doc_check check (
    documento_stato in ('bozza', 'approvato', 'chiuso')
  ),
  constraint produzione_schede_ordini_tipo_check check (
    entity_tipo in ('ordine', 'campionatura')
  ),
  constraint produzione_schede_ordini_numero_check check (
    char_length(trim(numero_scheda)) >= 2
  )
);

create unique index if not exists produzione_schede_ordini_ordine_uidx
  on public.produzione_schede_ordini (ordine_id)
  where deleted_at is null and ordine_id is not null;

create unique index if not exists produzione_schede_ordini_camp_uidx
  on public.produzione_schede_ordini (campionatura_id)
  where deleted_at is null and campionatura_id is not null;

create index if not exists produzione_schede_ordini_stato_idx
  on public.produzione_schede_ordini (scheda_stato, completata_at)
  where deleted_at is null;

drop trigger if exists produzione_schede_ordini_updated_at on public.produzione_schede_ordini;
create trigger produzione_schede_ordini_updated_at
  before update on public.produzione_schede_ordini
  for each row execute function public.set_updated_at();

create table if not exists public.produzione_schede_timeline (
  id uuid primary key default gen_random_uuid(),
  scheda_id uuid not null references public.produzione_schede_ordini (id) on delete cascade,
  evento_at timestamptz not null default now(),
  evento_tipo text not null,
  titolo text not null,
  dettaglio text not null default '',
  impegno_id uuid references public.produzione_calendario_impegni (id) on delete set null,
  actor_id uuid references auth.users (id) on delete set null,
  payload jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  created_by uuid references auth.users (id) on delete set null,
  updated_by uuid references auth.users (id) on delete set null,
  constraint produzione_schede_timeline_tipo_check check (
    evento_tipo in (
      'aperta',
      'scaletta',
      'lavorazione',
      'trasformazione',
      'attivita',
      'confezionamento',
      'problema',
      'pronto_ritiro',
      'completa',
      'archivio',
      'nota'
    )
  )
);

create index if not exists produzione_schede_timeline_scheda_idx
  on public.produzione_schede_timeline (scheda_id, evento_at desc);

alter table public.produzione_schede_ordini enable row level security;
alter table public.produzione_schede_timeline enable row level security;

drop policy if exists "produzione_schede_ordini_select" on public.produzione_schede_ordini;
create policy "produzione_schede_ordini_select"
  on public.produzione_schede_ordini for select to authenticated
  using (
    public.is_superadmin()
    or public.has_area_access('produzione')
    or public.has_area_access('amministrazione')
    or public.has_area_access('commerciale')
  );

drop policy if exists "produzione_schede_ordini_write" on public.produzione_schede_ordini;
create policy "produzione_schede_ordini_write"
  on public.produzione_schede_ordini for all to authenticated
  using (
    public.is_superadmin()
    or public.has_area_access('produzione')
    or public.has_area_access('amministrazione')
  )
  with check (
    public.is_superadmin()
    or public.has_area_access('produzione')
    or public.has_area_access('amministrazione')
  );

drop policy if exists "produzione_schede_timeline_select" on public.produzione_schede_timeline;
create policy "produzione_schede_timeline_select"
  on public.produzione_schede_timeline for select to authenticated
  using (
    public.is_superadmin()
    or public.has_area_access('produzione')
    or public.has_area_access('amministrazione')
    or public.has_area_access('commerciale')
  );

drop policy if exists "produzione_schede_timeline_insert" on public.produzione_schede_timeline;
create policy "produzione_schede_timeline_insert"
  on public.produzione_schede_timeline for insert to authenticated
  with check (
    public.is_superadmin()
    or public.has_area_access('produzione')
    or public.has_area_access('amministrazione')
  );

grant select, insert, update on table public.produzione_schede_ordini to authenticated;
grant select, insert on table public.produzione_schede_timeline to authenticated;
grant all on table public.produzione_schede_ordini to postgres, service_role;
grant all on table public.produzione_schede_timeline to postgres, service_role;
revoke delete on table public.produzione_schede_ordini from authenticated;
revoke update, delete on table public.produzione_schede_timeline from authenticated;

comment on table public.produzione_schede_ordini is
  'Schede ordine/campionatura: Aperte, Complete (30 gg), poi Archivio';
comment on table public.produzione_schede_timeline is
  'Timeline immutabile della scheda (lavorazione, confezionamento, scaletta)';
comment on column public.produzione_calendario_impegni.archiviata_at is
  'Lavorazione/attività completata: esce dalla scaletta operativa e va in Archivio';
