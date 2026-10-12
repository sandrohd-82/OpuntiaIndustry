-- Link temporaneo per la sola pagina Commercialista.
-- ISO 9001: 8.5.2 chi prepara il link, fino a quando, sostituzione e accessi.
-- Il segreto non è in tabella: si conserva solo l'impronta SHA-256.

create table if not exists public.commercialista_link_ospite (
  id uuid primary key default gen_random_uuid(),
  token_hash text not null,
  expires_at timestamptz not null,
  revoked_at timestamptz,
  revoked_by uuid,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  created_by uuid,
  updated_by uuid
);

comment on table public.commercialista_link_ospite is
  'Link ospite commercialista: un solo link vivo, scadenza 3 giorni, solo impronta del codice.';

create unique index if not exists commercialista_link_ospite_hash_idx
  on public.commercialista_link_ospite (token_hash);

create unique index if not exists commercialista_link_ospite_uno_attivo
  on public.commercialista_link_ospite ((true))
  where revoked_at is null;

drop trigger if exists commercialista_link_ospite_updated_at
  on public.commercialista_link_ospite;
create trigger commercialista_link_ospite_updated_at
  before update on public.commercialista_link_ospite
  for each row execute function public.set_updated_at();

alter table public.commercialista_link_ospite enable row level security;

revoke all on table public.commercialista_link_ospite from public, anon, authenticated;
grant all on table public.commercialista_link_ospite to postgres, service_role;
