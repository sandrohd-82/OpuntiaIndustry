-- Mappa Magazzino: colore per ogni linea tracciata (ISO 9001).

alter table public.magazzino_mappa_linee
  add column if not exists colore text not null default '#0f172a';

alter table public.magazzino_mappa_linee
  drop constraint if exists mag_mappa_linee_colore_check;

alter table public.magazzino_mappa_linee
  add constraint mag_mappa_linee_colore_check
  check (colore ~ '^#[0-9A-Fa-f]{6}$');

comment on column public.magazzino_mappa_linee.colore is
  'Colore HEX della linea (#rrggbb)';

notify pgrst, 'reload schema';
