-- ISO 9001: nome istituto bancario opzionale sulla scheda operatore.
-- Testo libero (es. Unicredit, Credem). Soft delete già su organigramma_persone.

alter table public.organigramma_persone
  add column if not exists banca_istituto text;

comment on column public.organigramma_persone.banca_istituto is
  'Nome istituto bancario (opzionale), es. Unicredit, Credem.';
