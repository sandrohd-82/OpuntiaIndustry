-- Unità carico prodotti propri: kg, g, lt, ml, pz (scheda + override).

alter table public.magazzino_giacenze
  drop constraint if exists magazzino_giacenze_unita_check;
alter table public.magazzino_giacenze
  add constraint magazzino_giacenze_unita_check
  check (unita in ('kg', 'g', 'lt', 'ml', 'pz'));

alter table public.magazzino_movimenti
  drop constraint if exists magazzino_movimenti_unita_check;
alter table public.magazzino_movimenti
  add constraint magazzino_movimenti_unita_check
  check (unita in ('kg', 'g', 'lt', 'ml', 'pz'));

comment on column public.magazzino_giacenze.unita is
  'Unità di giacenza (base scheda: kg/lt/pz; g/ml ammessi per allineamento movimenti).';
comment on column public.magazzino_movimenti.unita is
  'Unità inserita dall''operatore sul movimento di carico/scarico.';
