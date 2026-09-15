-- ISO 9001 7.5: validità del preventivo registrata sul documento.
-- Audit e soft delete restano sulla testata.

alter table public.preventivi
  add column if not exists validita_giorni integer not null default 15;

alter table public.preventivi
  drop constraint if exists preventivi_validita_giorni_check;

alter table public.preventivi
  add constraint preventivi_validita_giorni_check
  check (validita_giorni >= 1 and validita_giorni <= 365);

comment on column public.preventivi.validita_giorni is
  'Giorni di validità del preventivo (timbro sul documento).';
