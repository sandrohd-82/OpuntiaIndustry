-- Indici per elenco/ordinamento webmail (senza body).
-- Soft delete invariato: gli indici escludono purged.

create index if not exists webmail_messaggi_list_received_idx
  on public.webmail_messaggi (account_id, received_at desc nulls last, id desc)
  where purged_at is null;

create index if not exists webmail_messaggi_list_seen_idx
  on public.webmail_messaggi (account_id, is_seen, received_at desc nulls last)
  where purged_at is null;

create index if not exists webmail_messaggi_list_categoria_received_idx
  on public.webmail_messaggi (account_id, categoria_id, received_at desc nulls last)
  where purged_at is null;
