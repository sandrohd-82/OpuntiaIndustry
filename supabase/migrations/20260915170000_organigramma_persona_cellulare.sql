-- ISO 9001 8.5.2 / 7.5: recapito cellulare sulla scheda operatore.
-- Audit e soft delete restano su organigramma_persone.

alter table public.organigramma_persone
  add column if not exists cellulare text not null default '';

comment on column public.organigramma_persone.cellulare is
  'Numero di cellulare dell’operatore (scheda HR e snapshot preventivo).';
