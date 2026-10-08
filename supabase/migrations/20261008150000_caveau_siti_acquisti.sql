-- Acquisti collegati a un sito del caveau. Nessuna password in questa tabella.

create table if not exists public.caveau_siti_acquisti (
  id uuid primary key default gen_random_uuid(),
  sito_id uuid not null references public.caveau_siti_aziendali (id),
  url text not null,
  titolo text not null,
  descrizione text not null default '',
  prezzo numeric(12, 2),
  registrato_at timestamptz,
  versione integer not null default 1,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  created_by uuid,
  updated_by uuid,
  deleted_at timestamptz,
  deleted_by uuid,
  constraint caveau_acquisti_url_non_vuoto check (char_length(btrim(url)) > 0),
  constraint caveau_acquisti_titolo_non_vuoto check (char_length(btrim(titolo)) > 0),
  constraint caveau_acquisti_prezzo_non_negativo check (prezzo is null or prezzo >= 0),
  constraint caveau_acquisti_versione_positiva check (versione >= 1)
);

create index if not exists caveau_siti_acquisti_vivi_idx
  on public.caveau_siti_acquisti (sito_id, registrato_at desc)
  where deleted_at is null;

drop trigger if exists caveau_siti_acquisti_set_updated_at on public.caveau_siti_acquisti;
create trigger caveau_siti_acquisti_set_updated_at
  before update on public.caveau_siti_acquisti
  for each row execute function public.set_updated_at();

alter table public.caveau_siti_acquisti enable row level security;

revoke all on table public.caveau_siti_acquisti from anon, authenticated;

comment on table public.caveau_siti_acquisti is
  'Acquisti di un sito aziendale. Obbligatori url e titolo. Accesso solo Super Admin via service role.';
