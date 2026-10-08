-- Caveau dei siti a cui l'azienda è registrata.
-- Password solo cifrata. Nessuna policy client: lettura e scrittura dal service role dopo il gate Super Admin.

create table if not exists public.caveau_siti_aziendali (
  id uuid primary key default gen_random_uuid(),
  nome text not null,
  url text not null default '',
  mail text not null default '',
  password_cifrata text not null,
  versione integer not null default 1,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  created_by uuid,
  updated_by uuid,
  deleted_at timestamptz,
  deleted_by uuid,
  constraint caveau_siti_nome_non_vuoto check (char_length(btrim(nome)) > 0),
  constraint caveau_siti_versione_positiva check (versione >= 1)
);

create index if not exists caveau_siti_aziendali_vivi_idx
  on public.caveau_siti_aziendali (nome)
  where deleted_at is null;

drop trigger if exists caveau_siti_aziendali_set_updated_at on public.caveau_siti_aziendali;
create trigger caveau_siti_aziendali_set_updated_at
  before update on public.caveau_siti_aziendali
  for each row execute function public.set_updated_at();

alter table public.caveau_siti_aziendali enable row level security;

revoke all on table public.caveau_siti_aziendali from anon, authenticated;
grant select, insert, update, delete on table public.caveau_siti_aziendali to service_role;

comment on table public.caveau_siti_aziendali is
  'Siti aziendali registrati. La password è cifrata (AES-256-GCM). Accesso solo Super Admin via service role.';
