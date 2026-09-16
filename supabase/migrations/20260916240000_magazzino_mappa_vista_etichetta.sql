-- Mappa Magazzino: testo Vista obbligatorio prima del disegno (ISO 9001).

alter table public.magazzino_mappe
  add column if not exists vista_etichetta text not null default '';

comment on column public.magazzino_mappe.vista_etichetta is
  'Testo della vista di disegno, es. Dall''alto, Lato fronte, Lato Dx';

notify pgrst, 'reload schema';
