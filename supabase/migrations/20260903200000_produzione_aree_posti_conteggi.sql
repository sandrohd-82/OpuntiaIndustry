-- Produzione: aree, posti lavoro, fogli e bilancio di massa (ISO 9001 8.5 / 10.2).
-- Soft delete + audit. Mai delete fisico.

-- ---------------------------------------------------------------------------
-- Aree produttive (Lavaggio, Taglio, …)
-- ---------------------------------------------------------------------------
create table if not exists public.produzione_aree (
  id uuid primary key default gen_random_uuid(),
  codice text not null,
  nome text not null,
  descrizione text not null default '',
  richiede_bilancio_massa boolean not null default false,
  attivo boolean not null default true,
  sort_order integer not null default 0,
  versione integer not null default 1,
  documento_stato text not null default 'approvato'
    check (documento_stato in ('bozza', 'approvato', 'chiuso')),
  note text not null default '',
  created_by uuid references auth.users (id) on delete set null,
  updated_by uuid references auth.users (id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz,
  deleted_by uuid references auth.users (id) on delete set null
);

create unique index if not exists produzione_aree_codice_lower_uidx
  on public.produzione_aree (lower(codice))
  where deleted_at is null;

comment on table public.produzione_aree is
  'Aree di Gestione Aree. Un’area raggruppa più posti lavoro con obiettivo comune.';

drop trigger if exists produzione_aree_updated_at on public.produzione_aree;
create trigger produzione_aree_updated_at
  before update on public.produzione_aree
  for each row execute function public.set_updated_at();

alter table public.produzione_aree enable row level security;
drop policy if exists produzione_aree_all on public.produzione_aree;
create policy produzione_aree_all
  on public.produzione_aree for all to authenticated
  using (
    public.has_area_access('produzione')
    or public.has_area_access('amministrazione')
    or public.is_superadmin()
  )
  with check (
    public.has_area_access('produzione')
    or public.has_area_access('amministrazione')
    or public.is_superadmin()
  );
grant select, insert, update on table public.produzione_aree to authenticated;
grant all on table public.produzione_aree to postgres, service_role;
revoke delete on table public.produzione_aree from authenticated;

-- ---------------------------------------------------------------------------
-- Posti lavoro (Spaccapale, Cubettatrice, …)
-- ---------------------------------------------------------------------------
create table if not exists public.produzione_posti_lavoro (
  id uuid primary key default gen_random_uuid(),
  area_id uuid not null references public.produzione_aree (id),
  codice text not null,
  nome text not null,
  descrizione text not null default '',
  attivo boolean not null default true,
  sort_order integer not null default 0,
  note text not null default '',
  created_by uuid references auth.users (id) on delete set null,
  updated_by uuid references auth.users (id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz,
  deleted_by uuid references auth.users (id) on delete set null
);

create unique index if not exists produzione_posti_lavoro_area_codice_uidx
  on public.produzione_posti_lavoro (area_id, lower(codice))
  where deleted_at is null;

comment on table public.produzione_posti_lavoro is
  'Postazione in cui un operatore esegue un’operazione all’interno di un’area.';

drop trigger if exists produzione_posti_lavoro_updated_at on public.produzione_posti_lavoro;
create trigger produzione_posti_lavoro_updated_at
  before update on public.produzione_posti_lavoro
  for each row execute function public.set_updated_at();

alter table public.produzione_posti_lavoro enable row level security;
drop policy if exists produzione_posti_lavoro_all on public.produzione_posti_lavoro;
create policy produzione_posti_lavoro_all
  on public.produzione_posti_lavoro for all to authenticated
  using (
    public.has_area_access('produzione')
    or public.has_area_access('amministrazione')
    or public.is_superadmin()
  )
  with check (
    public.has_area_access('produzione')
    or public.has_area_access('amministrazione')
    or public.is_superadmin()
  );
grant select, insert, update on table public.produzione_posti_lavoro to authenticated;
grant all on table public.produzione_posti_lavoro to postgres, service_role;
revoke delete on table public.produzione_posti_lavoro from authenticated;

-- ---------------------------------------------------------------------------
-- Fogli di lavorazione (documento giornaliero)
-- ---------------------------------------------------------------------------
create table if not exists public.produzione_fogli_lavorazione (
  id uuid primary key default gen_random_uuid(),
  codice text not null,
  descrizione text not null default '',
  prodotto text not null default '',
  stato text not null default 'aperto'
    check (stato in ('aperto', 'chiuso')),
  versione integer not null default 1,
  documento_stato text not null default 'bozza'
    check (documento_stato in ('bozza', 'approvato', 'chiuso')),
  started_at timestamptz not null,
  expected_end_at timestamptz not null,
  closed_at timestamptz,
  closed_by uuid references auth.users (id) on delete set null,
  note text not null default '',
  motivo text not null default 'magazzino'
    check (motivo in ('magazzino', 'ordine')),
  ordine_id text,
  ordine_label text,
  lotto_id text,
  lotto_label text,
  codice_prodotto_uscita text,
  created_by uuid references auth.users (id) on delete set null,
  updated_by uuid references auth.users (id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz,
  deleted_by uuid references auth.users (id) on delete set null
);

create unique index if not exists produzione_fogli_lavorazione_codice_uidx
  on public.produzione_fogli_lavorazione (lower(codice))
  where deleted_at is null;

comment on table public.produzione_fogli_lavorazione is
  'Foglio di lavorazione giornaliero (documento ISO 9001: stato + versione).';

drop trigger if exists produzione_fogli_lavorazione_updated_at
  on public.produzione_fogli_lavorazione;
create trigger produzione_fogli_lavorazione_updated_at
  before update on public.produzione_fogli_lavorazione
  for each row execute function public.set_updated_at();

alter table public.produzione_fogli_lavorazione enable row level security;
drop policy if exists produzione_fogli_lavorazione_all
  on public.produzione_fogli_lavorazione;
create policy produzione_fogli_lavorazione_all
  on public.produzione_fogli_lavorazione for all to authenticated
  using (
    public.has_area_access('produzione')
    or public.has_area_access('amministrazione')
    or public.is_superadmin()
  )
  with check (
    public.has_area_access('produzione')
    or public.has_area_access('amministrazione')
    or public.is_superadmin()
  );
grant select, insert, update on table public.produzione_fogli_lavorazione to authenticated;
grant all on table public.produzione_fogli_lavorazione to postgres, service_role;
revoke delete on table public.produzione_fogli_lavorazione from authenticated;

-- ---------------------------------------------------------------------------
-- Conteggi / bilancio di massa (es. Lavaggio)
-- versati = essiccatori + non_conformi
-- ---------------------------------------------------------------------------
create table if not exists public.produzione_foglio_conteggi (
  id uuid primary key default gen_random_uuid(),
  foglio_id uuid not null references public.produzione_fogli_lavorazione (id),
  area_id uuid not null references public.produzione_aree (id),
  kg_versati numeric(14, 3) not null default 0,
  kg_essiccatori numeric(14, 3) not null default 0,
  kg_non_conformi numeric(14, 3) not null default 0,
  esito_bilancio text not null default 'incompleto'
    check (esito_bilancio in ('incompleto', 'ok', 'squilibrio')),
  delta_kg numeric(14, 3) not null default 0,
  note_nc text not null default '',
  esito_nc text not null default '',
  approved_at timestamptz,
  approved_by uuid references auth.users (id) on delete set null,
  created_by uuid references auth.users (id) on delete set null,
  updated_by uuid references auth.users (id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz,
  deleted_by uuid references auth.users (id) on delete set null,
  constraint produzione_foglio_conteggi_kg_check check (
    kg_versati >= 0 and kg_essiccatori >= 0 and kg_non_conformi >= 0
  )
);

create unique index if not exists produzione_foglio_conteggi_foglio_area_uidx
  on public.produzione_foglio_conteggi (foglio_id, area_id)
  where deleted_at is null;

comment on table public.produzione_foglio_conteggi is
  'Bilancio di massa sul foglio: kg versati = kg essiccatori + kg non conformi.';

drop trigger if exists produzione_foglio_conteggi_updated_at
  on public.produzione_foglio_conteggi;
create trigger produzione_foglio_conteggi_updated_at
  before update on public.produzione_foglio_conteggi
  for each row execute function public.set_updated_at();

alter table public.produzione_foglio_conteggi enable row level security;
drop policy if exists produzione_foglio_conteggi_all
  on public.produzione_foglio_conteggi;
create policy produzione_foglio_conteggi_all
  on public.produzione_foglio_conteggi for all to authenticated
  using (
    public.has_area_access('produzione')
    or public.has_area_access('amministrazione')
    or public.is_superadmin()
  )
  with check (
    public.has_area_access('produzione')
    or public.has_area_access('amministrazione')
    or public.is_superadmin()
  );
grant select, insert, update on table public.produzione_foglio_conteggi to authenticated;
grant all on table public.produzione_foglio_conteggi to postgres, service_role;
revoke delete on table public.produzione_foglio_conteggi from authenticated;

-- ---------------------------------------------------------------------------
-- Seed aree + posti (Taglio: 3 postazioni; Lavaggio: bilancio)
-- ---------------------------------------------------------------------------
insert into public.produzione_aree (
  codice, nome, descrizione, richiede_bilancio_massa, sort_order, documento_stato
)
select v.codice, v.nome, v.descrizione, v.bilancio, v.sort_order, 'approvato'
from (values
  ('lavaggio', 'Lavaggio', 'Versamento e conteggio materia in ingresso verso essiccazione.', true, 10),
  ('taglio', 'Taglio', 'Taglio e porzionatura: più posti, stesso obiettivo di lotto.', false, 20),
  ('essiccatori', 'Essiccatori', 'Essiccazione del prodotto pesato in uscita dal lavaggio.', false, 30),
  ('triturazione', 'Triturazione', 'Triturazione e riduzione volumetrica.', false, 40)
) as v(codice, nome, descrizione, bilancio, sort_order)
where not exists (
  select 1 from public.produzione_aree a
  where lower(a.codice) = v.codice and a.deleted_at is null
);

insert into public.produzione_posti_lavoro (
  area_id, codice, nome, descrizione, sort_order
)
select a.id, v.codice, v.nome, v.descrizione, v.sort_order
from public.produzione_aree a
join (values
  ('lavaggio', 'linea-principale', 'Linea principale', 'Posto di versamento e controllo quantità in ingresso.', 10),
  ('taglio', 'spaccapale', 'Spaccapale', 'Spacco pale / cladodi. Operatore dedicato.', 10),
  ('taglio', 'cubettatrice', 'Cubettatrice', 'Cubettatura del prodotto. Operatore dedicato.', 20),
  ('taglio', 'coltelli', 'Coltelli', 'Taglio a coltello. Operatore dedicato.', 30)
) as v(area_codice, codice, nome, descrizione, sort_order)
  on a.codice = v.area_codice
where a.deleted_at is null
  and not exists (
    select 1 from public.produzione_posti_lavoro p
    where p.area_id = a.id and lower(p.codice) = v.codice and p.deleted_at is null
  );
