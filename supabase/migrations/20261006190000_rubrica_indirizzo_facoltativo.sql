-- Rubrica: indirizzo di recapito del contatto. Facoltativo (ISO 9001 7.5).
-- Non è un dato obbligatorio: i campi restano vuoti finché l'operatore non li compila.

alter table public.rubrica_contatti
  add column if not exists indirizzo text not null default '',
  add column if not exists cap text not null default '',
  add column if not exists citta text not null default '',
  add column if not exists provincia text not null default '',
  add column if not exists nazione text not null default '';

comment on column public.rubrica_contatti.indirizzo is
  'Via e civico del recapito. Facoltativo.';
comment on column public.rubrica_contatti.cap is
  'CAP del recapito. Facoltativo.';
comment on column public.rubrica_contatti.citta is
  'Città del recapito. Facoltativo.';
comment on column public.rubrica_contatti.provincia is
  'Provincia del recapito. Facoltativo.';
comment on column public.rubrica_contatti.nazione is
  'Paese del recapito. Facoltativo.';
