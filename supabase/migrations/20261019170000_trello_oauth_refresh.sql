-- Access token OAuth 2.0 a scadenza breve e refresh token monouso, entrambi cifrati.

alter table public.user_trello_credentials
  add column if not exists trello_refresh_token text not null default '',
  add column if not exists trello_access_expires_at timestamptz;

comment on column public.user_trello_credentials.trello_token is
  'Access token OAuth cifrato con CREDENTIALS_VAULT_KEY. Mai in chiaro e mai nei log.';

comment on column public.user_trello_credentials.trello_refresh_token is
  'Refresh token OAuth cifrato. Monouso, scade dopo 90 giorni.';
