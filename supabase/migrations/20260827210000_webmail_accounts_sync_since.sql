-- Sync temporale per casella: importa solo messaggi dal giorno indicato (ISO 9001).

alter table public.webmail_accounts
  add column if not exists sync_since date;

comment on column public.webmail_accounts.sync_since is
  'Se valorizzata, la sync IMAP importa solo messaggi da questa data (inclusa). Null = fallback ultimi 30 giorni.';
