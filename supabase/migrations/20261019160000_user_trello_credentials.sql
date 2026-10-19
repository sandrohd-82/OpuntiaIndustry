-- Token Trello personale, cifrato. Un operatore non legge il token di un altro.
-- Il collegamento alle bacheche locali serve alla sincronizzazione successiva.

create table if not exists public.user_trello_credentials (
  user_id uuid primary key references auth.users (id) on delete cascade,
  trello_token text not null default '',
  trello_username text not null default '',
  trello_avatar_url text not null default '',
  connected_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  created_by uuid,
  updated_by uuid,
  deleted_at timestamptz,
  deleted_by uuid,
  constraint user_trello_token_se_attivo check (
    deleted_at is not null or char_length(trello_token) > 0
  )
);

comment on table public.user_trello_credentials is
  'Token Trello dell''operatore, cifrato con CREDENTIALS_VAULT_KEY. Accesso solo dal server.';

comment on column public.user_trello_credentials.trello_token is
  'Cifrato. Mai in chiaro e mai nei log.';

drop trigger if exists user_trello_credentials_set_updated_at on public.user_trello_credentials;
create trigger user_trello_credentials_set_updated_at
  before update on public.user_trello_credentials
  for each row execute function public.set_updated_at();

alter table public.user_trello_credentials enable row level security;
revoke all on table public.user_trello_credentials from anon, authenticated;
grant select, insert, update, delete on table public.user_trello_credentials to service_role;

create table if not exists public.kb_trello_collegamenti (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  entita text not null,
  entita_id uuid not null,
  trello_id text not null,
  trello_board_id text not null default '',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  created_by uuid,
  updated_by uuid,
  deleted_at timestamptz,
  deleted_by uuid,
  constraint kb_trello_entita_check check (
    entita in ('bacheca', 'lista', 'scheda', 'etichetta', 'checklist')
  ),
  constraint kb_trello_id_len check (char_length(trim(trello_id)) between 1 and 40)
);

create unique index if not exists kb_trello_collegamenti_entita_idx
  on public.kb_trello_collegamenti (user_id, entita, entita_id)
  where deleted_at is null;

create index if not exists kb_trello_collegamenti_board_idx
  on public.kb_trello_collegamenti (user_id, trello_board_id)
  where deleted_at is null;

drop trigger if exists kb_trello_collegamenti_set_updated_at on public.kb_trello_collegamenti;
create trigger kb_trello_collegamenti_set_updated_at
  before update on public.kb_trello_collegamenti
  for each row execute function public.set_updated_at();

alter table public.kb_trello_collegamenti enable row level security;
revoke all on table public.kb_trello_collegamenti from anon, authenticated;
grant select, insert, update, delete on table public.kb_trello_collegamenti to service_role;

comment on table public.kb_trello_collegamenti is
  'Corrispondenza tra bacheche locali e oggetti Trello dell''operatore che ha importato.';
