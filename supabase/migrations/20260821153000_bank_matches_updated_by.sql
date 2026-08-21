-- ISO audit: updated_by su match banca (prima gli insert fallivano silenziosamente)

alter table public.bank_invoice_matches
  add column if not exists updated_by uuid references auth.users (id) on delete set null;

comment on column public.bank_invoice_matches.updated_by is
  'Ultimo aggiornamento match (ISO 9001 audit).';
