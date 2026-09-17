-- Mappa Magazzino: spessore linea senza tetto (ISO 9001).

alter table public.magazzino_mappa_linee
  drop constraint if exists mag_mappa_linee_spessore_check;

alter table public.magazzino_mappa_linee
  add constraint mag_mappa_linee_spessore_check
  check (spessore > 0);

comment on column public.magazzino_mappa_linee.spessore is
  'Spessore della linea in pixel di disegno, senza limite superiore';

notify pgrst, 'reload schema';
