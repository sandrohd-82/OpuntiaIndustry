-- OpuntiaItalia / ecosistema portale pubblico
-- Utenti, newsletter e richieste contatto — separati da clienti B2B (gestionale)
-- Migration accodata al master OpuntiaIndustry

-- ---------------------------------------------------------------------------
-- Profili utenti portale (WikiOpuntia, newsletter, futuro B2C)
-- Distinti da public.profiles (staff gestionale)
-- ---------------------------------------------------------------------------
create table if not exists public.portale_utenti (
  id uuid primary key references auth.users (id) on delete cascade,
  email text not null,
  nome text not null default '',
  cognome text not null default '',
  locale_preferito text not null default 'it',
  origine text not null default 'opuntiaitalia',
  attivo boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint portale_utenti_locale_check check (
    locale_preferito in ('it', 'en', 'de', 'fr', 'es')
  ),
  constraint portale_utenti_origine_check check (
    origine in ('opuntiaitalia', 'wikiopuntia', 'newsletter')
  )
);

comment on table public.portale_utenti is
  'Utenti portale pubblico (non staff gestionale, non clienti B2B anagrafica)';

create index if not exists portale_utenti_email_idx on public.portale_utenti (email);

drop trigger if exists portale_utenti_updated_at on public.portale_utenti;
create trigger portale_utenti_updated_at
  before update on public.portale_utenti
  for each row execute function public.set_updated_at();

alter table public.portale_utenti enable row level security;

drop policy if exists "portale_utenti_select_own" on public.portale_utenti;
create policy "portale_utenti_select_own"
  on public.portale_utenti for select
  to authenticated
  using (id = auth.uid());

drop policy if exists "portale_utenti_insert_own" on public.portale_utenti;
create policy "portale_utenti_insert_own"
  on public.portale_utenti for insert
  to authenticated
  with check (id = auth.uid());

drop policy if exists "portale_utenti_update_own" on public.portale_utenti;
create policy "portale_utenti_update_own"
  on public.portale_utenti for update
  to authenticated
  using (id = auth.uid())
  with check (id = auth.uid());

grant select, insert, update on table public.portale_utenti to authenticated;
grant all on table public.portale_utenti to postgres, service_role;

-- ---------------------------------------------------------------------------
-- Newsletter (ex req_register_newsletter legacy)
-- ---------------------------------------------------------------------------
create table if not exists public.portale_newsletter_iscritti (
  id uuid primary key default gen_random_uuid(),
  email text not null,
  vuole_news boolean not null default true,
  vuole_pillole boolean not null default false,
  locale text not null default 'it',
  confermato boolean not null default false,
  token_conferma text unique,
  utente_id uuid references public.portale_utenti (id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint portale_newsletter_locale_check check (
    locale in ('it', 'en', 'de', 'fr', 'es')
  )
);

comment on table public.portale_newsletter_iscritti is
  'Iscrizioni newsletter / pillole Opuntia (portale pubblico)';

create unique index if not exists portale_newsletter_email_uidx
  on public.portale_newsletter_iscritti (lower(trim(email)));

drop trigger if exists portale_newsletter_iscritti_updated_at on public.portale_newsletter_iscritti;
create trigger portale_newsletter_iscritti_updated_at
  before update on public.portale_newsletter_iscritti
  for each row execute function public.set_updated_at();

alter table public.portale_newsletter_iscritti enable row level security;

drop policy if exists "portale_newsletter_insert_anon" on public.portale_newsletter_iscritti;
create policy "portale_newsletter_insert_anon"
  on public.portale_newsletter_iscritti for insert
  to anon, authenticated
  with check (true);

drop policy if exists "portale_newsletter_select_own" on public.portale_newsletter_iscritti;
create policy "portale_newsletter_select_own"
  on public.portale_newsletter_iscritti for select
  to authenticated
  using (
    utente_id = auth.uid()
    or public.is_superadmin()
  );

grant insert on table public.portale_newsletter_iscritti to anon, authenticated;
grant select on table public.portale_newsletter_iscritti to authenticated;
grant all on table public.portale_newsletter_iscritti to postgres, service_role;

-- ---------------------------------------------------------------------------
-- Richieste contatto (ex form_contact_opuntia legacy)
-- ---------------------------------------------------------------------------
create table if not exists public.portale_richieste_contatto (
  id uuid primary key default gen_random_uuid(),
  nome text not null,
  cognome text not null default '',
  email text not null,
  telefono text not null default '',
  paese text not null default '',
  azienda text not null default '',
  oggetto text not null default '',
  prodotto_slug text not null default '',
  messaggio text not null,
  token_conferma text unique,
  email_confermata boolean not null default false,
  origine text not null default 'opuntiaitalia',
  locale text not null default 'it',
  created_at timestamptz not null default now(),
  constraint portale_richieste_messaggio_len check (char_length(trim(messaggio)) >= 10)
);

comment on table public.portale_richieste_contatto is
  'Form contatti sito OpuntiaItalia (lead, no ordini online)';

create index if not exists portale_richieste_contatto_created_idx
  on public.portale_richieste_contatto (created_at desc);
create index if not exists portale_richieste_contatto_email_idx
  on public.portale_richieste_contatto (email);

alter table public.portale_richieste_contatto enable row level security;

drop policy if exists "portale_contatto_insert_anon" on public.portale_richieste_contatto;
create policy "portale_contatto_insert_anon"
  on public.portale_richieste_contatto for insert
  to anon, authenticated
  with check (true);

drop policy if exists "portale_contatto_select_staff" on public.portale_richieste_contatto;
create policy "portale_contatto_select_staff"
  on public.portale_richieste_contatto for select
  to authenticated
  using (public.has_area_access('amministrazione') or public.is_superadmin());

grant insert on table public.portale_richieste_contatto to anon, authenticated;
grant select on table public.portale_richieste_contatto to authenticated;
grant all on table public.portale_richieste_contatto to postgres, service_role;
