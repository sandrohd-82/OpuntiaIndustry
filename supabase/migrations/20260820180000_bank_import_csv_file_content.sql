-- Salvataggio file CSV import banca (audit ISO 9001 — informazioni registrate)

alter table public.bank_import_batches
  add column if not exists file_content text not null default '';

alter table public.bank_import_batches
  add column if not exists file_content_bytes integer not null default 0;

comment on column public.bank_import_batches.file_content is
  'Contenuto testuale del CSV caricato (tracciabilità documento di origine)';
comment on column public.bank_import_batches.file_content_bytes is
  'Dimensione originale del file in byte';
