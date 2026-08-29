-- OpuntiaIndustry — layer ecosistema Master (Opzione A)
-- Accodata dopo:
--   20260829110000_opuntiaitalia_portale_foundation.sql
--   20260829120000_wikiopuntia_foundation.sql
--   20260829130000_wikiopuntia_pgvector_rag.sql
-- Non duplica tabelle satelliti (portale_*, wiki_*). Le allinea ISO e aggiunge
-- catalogo/listini/ordini/canali + viste pubbliche per i siti.

-- ===========================================================================
-- 1. ISO su tabelle già create dai satelliti
-- ===========================================================================

alter table public.portale_utenti
  add column if not exists cliente_id uuid references public.clienti (id) on delete set null,
  add column if not exists created_by uuid references auth.users (id) on delete set null,
  add column if not exists updated_by uuid references auth.users (id) on delete set null,
  add column if not exists deleted_at timestamptz,
  add column if not exists deleted_by uuid references auth.users (id) on delete set null;

alter table public.portale_utenti
  drop constraint if exists portale_utenti_origine_check;
alter table public.portale_utenti
  add constraint portale_utenti_origine_check
  check (origine in ('opuntiaitalia', 'wikiopuntia', 'newsletter', 'b2c'));

create index if not exists portale_utenti_cliente_id_idx
  on public.portale_utenti (cliente_id)
  where deleted_at is null;

alter table public.portale_newsletter_iscritti
  add column if not exists created_by uuid references auth.users (id) on delete set null,
  add column if not exists updated_by uuid references auth.users (id) on delete set null,
  add column if not exists deleted_at timestamptz,
  add column if not exists deleted_by uuid references auth.users (id) on delete set null;

drop policy if exists "portale_newsletter_select_own" on public.portale_newsletter_iscritti;
create policy "portale_newsletter_select_own"
  on public.portale_newsletter_iscritti for select
  to authenticated
  using (
    deleted_at is null
    and (
      utente_id = auth.uid()
      or public.has_area_access('amministrazione')
      or public.is_superadmin()
    )
  );

alter table public.portale_richieste_contatto
  add column if not exists updated_at timestamptz not null default now(),
  add column if not exists created_by uuid references auth.users (id) on delete set null,
  add column if not exists updated_by uuid references auth.users (id) on delete set null,
  add column if not exists deleted_at timestamptz,
  add column if not exists deleted_by uuid references auth.users (id) on delete set null,
  add column if not exists stato text not null default 'nuova';

alter table public.portale_richieste_contatto
  drop constraint if exists portale_richieste_stato_check;
alter table public.portale_richieste_contatto
  add constraint portale_richieste_stato_check
  check (stato in ('nuova', 'presa_in_carico', 'chiusa'));

drop trigger if exists portale_richieste_contatto_updated_at on public.portale_richieste_contatto;
create trigger portale_richieste_contatto_updated_at
  before update on public.portale_richieste_contatto
  for each row execute function public.set_updated_at();

drop policy if exists "portale_contatto_select_staff" on public.portale_richieste_contatto;
create policy "portale_contatto_select_staff"
  on public.portale_richieste_contatto for select
  to authenticated
  using (
    deleted_at is null
    and (public.has_area_access('amministrazione') or public.is_superadmin())
  );

drop policy if exists "portale_contatto_update_staff" on public.portale_richieste_contatto;
create policy "portale_contatto_update_staff"
  on public.portale_richieste_contatto for update
  to authenticated
  using (public.has_area_access('amministrazione') or public.is_superadmin())
  with check (public.has_area_access('amministrazione') or public.is_superadmin());

grant update on table public.portale_richieste_contatto to authenticated;

alter table public.wiki_scientific_research
  add column if not exists versione integer not null default 1,
  add column if not exists approved_at timestamptz,
  add column if not exists approved_by uuid references auth.users (id) on delete set null,
  add column if not exists rs_ricerca_id uuid references public.rs_ricerche (id) on delete set null;

alter table public.wiki_scientific_research
  drop constraint if exists wiki_scientific_research_versione_check;
alter table public.wiki_scientific_research
  add constraint wiki_scientific_research_versione_check check (versione >= 1);

alter table public.wiki_document_chunks
  add column if not exists embedding_model text not null default '',
  add column if not exists created_by uuid references auth.users (id) on delete set null;

drop policy if exists "wiki_chunks_insert_staff" on public.wiki_document_chunks;
create policy "wiki_chunks_insert_staff"
  on public.wiki_document_chunks for insert to authenticated
  with check (public.has_area_access('wikiopuntia') or public.is_superadmin());

drop policy if exists "wiki_chunks_update_staff" on public.wiki_document_chunks;
create policy "wiki_chunks_update_staff"
  on public.wiki_document_chunks for update to authenticated
  using (public.has_area_access('wikiopuntia') or public.is_superadmin())
  with check (public.has_area_access('wikiopuntia') or public.is_superadmin());

grant insert, update on table public.wiki_document_chunks to authenticated;

-- ===========================================================================
-- 2. Prodotti propri: pubblicazione canali (B2B / Wiki / B2C)
-- ===========================================================================

alter table public.prodotti_propri
  add column if not exists slug_pubblico text,
  add column if not exists nome_pubblico text not null default '',
  add column if not exists descrizione_pubblica text not null default '',
  add column if not exists unita_misura text not null default 'kg',
  add column if not exists visibile_b2b boolean not null default false,
  add column if not exists visibile_b2c boolean not null default false,
  add column if not exists visibile_wiki boolean not null default false,
  add column if not exists stato_pubblicazione text not null default 'bozza',
  add column if not exists published_at timestamptz,
  add column if not exists published_by uuid references auth.users (id) on delete set null;

alter table public.prodotti_propri
  drop constraint if exists prodotti_propri_stato_pubblicazione_check;
alter table public.prodotti_propri
  add constraint prodotti_propri_stato_pubblicazione_check
  check (stato_pubblicazione in ('bozza', 'approvato', 'pubblicato', 'ritirato'));

create unique index if not exists prodotti_propri_slug_pubblico_uidx
  on public.prodotti_propri (lower(trim(slug_pubblico)))
  where deleted_at is null
    and slug_pubblico is not null
    and length(trim(slug_pubblico)) > 0;

comment on column public.prodotti_propri.slug_pubblico is
  'Slug URL per OpuntiaItalia / e-commerce / Wiki. Univoco se valorizzato.';
comment on column public.prodotti_propri.stato_pubblicazione is
  'ISO documento vetrina: bozza | approvato | pubblicato | ritirato';

-- ===========================================================================
-- 3. Listini versionati (B2B ora, B2C dopo)
-- ===========================================================================

create table if not exists public.listini (
  id uuid primary key default gen_random_uuid(),
  codice text not null,
  nome text not null,
  canale text not null default 'b2b',
  valuta text not null default 'EUR',
  valido_dal date not null default current_date,
  valido_al date,
  versione integer not null default 1,
  stato text not null default 'bozza',
  approved_at timestamptz,
  approved_by uuid references auth.users (id) on delete set null,
  published_at timestamptz,
  published_by uuid references auth.users (id) on delete set null,
  note text not null default '',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  created_by uuid references auth.users (id) on delete set null,
  updated_by uuid references auth.users (id) on delete set null,
  deleted_at timestamptz,
  deleted_by uuid references auth.users (id) on delete set null,
  constraint listini_canale_check check (canale in ('b2b', 'b2c')),
  constraint listini_stato_check check (
    stato in ('bozza', 'approvato', 'pubblicato', 'chiuso')
  ),
  constraint listini_versione_check check (versione >= 1),
  constraint listini_codice_len check (char_length(trim(codice)) >= 2),
  constraint listini_nome_len check (char_length(trim(nome)) >= 1),
  constraint listini_validita_check check (
    valido_al is null or valido_al >= valido_dal
  )
);

comment on table public.listini is
  'Listini vendita versionati (B2B OpuntiaItalia / futuro B2C). Source of truth: gestionale.';

create unique index if not exists listini_codice_active_uidx
  on public.listini (lower(trim(codice)))
  where deleted_at is null;

create index if not exists listini_canale_stato_idx
  on public.listini (canale, stato, valido_dal desc)
  where deleted_at is null;

drop trigger if exists listini_updated_at on public.listini;
create trigger listini_updated_at
  before update on public.listini
  for each row execute function public.set_updated_at();

create table if not exists public.listini_righe (
  id uuid primary key default gen_random_uuid(),
  listino_id uuid not null references public.listini (id) on delete cascade,
  prodotto_id uuid not null references public.prodotti_propri (id) on delete restrict,
  prezzo numeric(14, 4) not null,
  iva_percentuale numeric(6, 2) not null default 22,
  min_qty numeric(14, 4) not null default 0,
  sconto_max_pct numeric(6, 2) not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  created_by uuid references auth.users (id) on delete set null,
  updated_by uuid references auth.users (id) on delete set null,
  deleted_at timestamptz,
  deleted_by uuid references auth.users (id) on delete set null,
  constraint listini_righe_prezzo_check check (prezzo >= 0),
  constraint listini_righe_iva_check check (iva_percentuale >= 0),
  constraint listini_righe_min_qty_check check (min_qty >= 0),
  constraint listini_righe_sconto_check check (
    sconto_max_pct >= 0 and sconto_max_pct <= 100
  )
);

comment on table public.listini_righe is
  'Prezzi per prodotto all''interno di un listino versionato.';

create unique index if not exists listini_righe_prodotto_active_uidx
  on public.listini_righe (listino_id, prodotto_id)
  where deleted_at is null;

create index if not exists listini_righe_prodotto_idx
  on public.listini_righe (prodotto_id)
  where deleted_at is null;

drop trigger if exists listini_righe_updated_at on public.listini_righe;
create trigger listini_righe_updated_at
  before update on public.listini_righe
  for each row execute function public.set_updated_at();

alter table public.listini enable row level security;
alter table public.listini_righe enable row level security;

drop policy if exists "listini_select_amm" on public.listini;
create policy "listini_select_amm"
  on public.listini for select to authenticated
  using (
    deleted_at is null
    and (public.has_area_access('amministrazione') or public.is_superadmin())
  );

drop policy if exists "listini_insert_amm" on public.listini;
create policy "listini_insert_amm"
  on public.listini for insert to authenticated
  with check (public.has_area_access('amministrazione') or public.is_superadmin());

drop policy if exists "listini_update_amm" on public.listini;
create policy "listini_update_amm"
  on public.listini for update to authenticated
  using (public.has_area_access('amministrazione') or public.is_superadmin())
  with check (public.has_area_access('amministrazione') or public.is_superadmin());

drop policy if exists "listini_righe_select_amm" on public.listini_righe;
create policy "listini_righe_select_amm"
  on public.listini_righe for select to authenticated
  using (
    deleted_at is null
    and (public.has_area_access('amministrazione') or public.is_superadmin())
  );

drop policy if exists "listini_righe_insert_amm" on public.listini_righe;
create policy "listini_righe_insert_amm"
  on public.listini_righe for insert to authenticated
  with check (public.has_area_access('amministrazione') or public.is_superadmin());

drop policy if exists "listini_righe_update_amm" on public.listini_righe;
create policy "listini_righe_update_amm"
  on public.listini_righe for update to authenticated
  using (public.has_area_access('amministrazione') or public.is_superadmin())
  with check (public.has_area_access('amministrazione') or public.is_superadmin());

grant select, insert, update on table public.listini to authenticated;
grant select, insert, update on table public.listini_righe to authenticated;
grant all on table public.listini to postgres, service_role;
grant all on table public.listini_righe to postgres, service_role;
revoke delete on table public.listini from authenticated;
revoke delete on table public.listini_righe from authenticated;

-- ===========================================================================
-- 4. Ordini: canale ecosistema (senza duplicare la tabella)
-- ===========================================================================

alter table public.ordini
  add column if not exists canale text not null default 'gestionale',
  add column if not exists listino_id uuid references public.listini (id) on delete set null,
  add column if not exists external_ref text not null default '',
  add column if not exists portale_utente_id uuid references public.portale_utenti (id) on delete set null;

alter table public.ordini
  drop constraint if exists ordini_canale_check;
alter table public.ordini
  add constraint ordini_canale_check
  check (canale in ('gestionale', 'b2b', 'b2c'));

create unique index if not exists ordini_canale_external_ref_uidx
  on public.ordini (canale, external_ref)
  where deleted_at is null and length(trim(external_ref)) > 0;

create index if not exists ordini_canale_idx
  on public.ordini (canale)
  where deleted_at is null;

comment on column public.ordini.canale is
  'Origine ordine: gestionale | b2b (OpuntiaItalia) | b2c (e-commerce futuro)';
comment on column public.ordini.external_ref is
  'ID ordine sul sito satellite. Idempotenza per (canale, external_ref).';

-- ===========================================================================
-- 5. Viste pubbliche (colonne sicure — i satelliti NON leggono le tabelle raw)
-- ===========================================================================

create or replace view public.v_catalogo_b2b
as
select
  p.id,
  p.codice,
  p.slug_pubblico,
  coalesce(nullif(trim(p.nome_pubblico), ''), p.nome) as nome,
  p.descrizione_pubblica,
  p.unita_misura,
  p.is_bio,
  p.updated_at
from public.prodotti_propri p
where p.deleted_at is null
  and p.visibile_b2b = true
  and p.stato_pubblicazione = 'pubblicato'
  and p.slug_pubblico is not null
  and length(trim(p.slug_pubblico)) > 0;

comment on view public.v_catalogo_b2b is
  'Catalogo B2B pubblicato. OpuntiaItalia: sola lettura. Nessun prezzo interno.';

create or replace view public.v_listino_b2b_vigente
as
select distinct on (r.prodotto_id)
  l.id as listino_id,
  l.codice as listino_codice,
  l.versione as listino_versione,
  l.valido_dal,
  l.valido_al,
  r.prodotto_id,
  p.codice as prodotto_codice,
  p.slug_pubblico,
  coalesce(nullif(trim(p.nome_pubblico), ''), p.nome) as nome,
  r.prezzo,
  r.iva_percentuale,
  r.min_qty,
  r.sconto_max_pct
from public.listini_righe r
join public.listini l on l.id = r.listino_id
join public.prodotti_propri p on p.id = r.prodotto_id
where r.deleted_at is null
  and l.deleted_at is null
  and p.deleted_at is null
  and l.canale = 'b2b'
  and l.stato = 'pubblicato'
  and l.valido_dal <= current_date
  and (l.valido_al is null or l.valido_al >= current_date)
  and p.visibile_b2b = true
  and p.stato_pubblicazione = 'pubblicato'
order by r.prodotto_id, l.valido_dal desc, l.versione desc;

comment on view public.v_listino_b2b_vigente is
  'Prezzi B2B vigenti (listino pubblicato in validità). Una riga per prodotto.';

create or replace view public.v_wiki_pubblicati
as
select
  r.id,
  r.slug,
  r.title,
  r.abstract,
  r.plant_parts,
  r.sectors,
  r.is_most_searched,
  r.is_evidence,
  r.published_year,
  r.published_month,
  r.published_at,
  r.external_link,
  r.pdf_available,
  r.versione
from public.wiki_scientific_research r
where r.deleted_at is null
  and r.status = 'published';

comment on view public.v_wiki_pubblicati is
  'Paper Wiki pubblicati (senza path storage / errori ingest).';

grant select on public.v_catalogo_b2b to anon, authenticated;
grant select on public.v_listino_b2b_vigente to anon, authenticated;
grant select on public.v_wiki_pubblicati to anon, authenticated;
grant all on public.v_catalogo_b2b to postgres, service_role;
grant all on public.v_listino_b2b_vigente to postgres, service_role;
grant all on public.v_wiki_pubblicati to postgres, service_role;
