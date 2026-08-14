-- Junction prodotto ↔ attività: flag obbligatoria/facoltativa (ISO 9001 calendario)

alter table public.prodotti_propri_attivita
  add column if not exists obbligatoria boolean not null default true;

comment on column public.prodotti_propri_attivita.obbligatoria is
  'Se true, attività pre-selezionata nel calendario ordine; se false, facoltativa (off di default)';
