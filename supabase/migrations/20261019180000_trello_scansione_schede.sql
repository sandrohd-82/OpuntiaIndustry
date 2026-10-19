alter table public.user_trello_credentials
  add column if not exists trello_scansione_at timestamptz;

comment on column public.user_trello_credentials.trello_scansione_at is
  'Ultimo controllo delle schede nuove su Trello. Il primo valore non genera notifiche.';
