-- Uscita dal cestino senza delete fisico (ISO 9001: soft delete + traccia).
-- Le mail con purged_at restano in archivio e non ricompaiono nel cestino.

alter table public.webmail_messaggi
  add column if not exists purged_at timestamptz,
  add column if not exists purged_by uuid;

create index if not exists webmail_messaggi_purged_idx
  on public.webmail_messaggi (account_id, purged_at desc)
  where purged_at is not null;

comment on column public.webmail_messaggi.purged_at is
  'ISO: nascosta dal cestino dopo conferma operatore; nessun delete fisico.';
