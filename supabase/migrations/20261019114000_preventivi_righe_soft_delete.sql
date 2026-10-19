-- Soft delete sulle righe del preventivo (ISO 9001). Nessuna cancellazione fisica.

alter table public.preventivi_righe
  add column if not exists deleted_at timestamptz,
  add column if not exists deleted_by uuid references auth.users (id) on delete set null;

comment on column public.preventivi_righe.deleted_at is
  'Soft delete ISO 9001. La riga resta in archivio quando la bozza viene eliminata.';
