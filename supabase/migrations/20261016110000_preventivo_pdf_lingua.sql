-- Due PDF per lo stesso invio: archivio italiano e copia tradotta allegata.
-- La riga inviata resta immutabile.

alter table public.preventivi_documenti_emessi
  add column if not exists lingua text not null default 'it';

alter table public.preventivi_documenti_emessi
  add column if not exists allegato_inviato boolean not null default true;

alter table public.preventivi_documenti_emessi
  drop constraint if exists preventivi_doc_emessi_lingua_check;

alter table public.preventivi_documenti_emessi
  add constraint preventivi_doc_emessi_lingua_check
  check (lingua ~ '^[a-z]{2}$');

drop index if exists public.preventivi_doc_emessi_versione_uidx;
create unique index if not exists preventivi_doc_emessi_versione_lingua_uidx
  on public.preventivi_documenti_emessi (preventivo_id, versione, lingua)
  where deleted_at is null;

drop index if exists public.preventivi_doc_emessi_preparato_uidx;
create unique index if not exists preventivi_doc_emessi_preparato_lingua_uidx
  on public.preventivi_documenti_emessi (preventivo_id, lingua)
  where deleted_at is null and stato = 'preparato';

comment on column public.preventivi_documenti_emessi.lingua is
  'Lingua del PDF: it per l''archivio italiano, altrimenti la lingua inviata al cliente.';

comment on column public.preventivi_documenti_emessi.allegato_inviato is
  'True solo per il PDF allegato alla mail. L''italiano di un cliente estero resta in archivio.';
