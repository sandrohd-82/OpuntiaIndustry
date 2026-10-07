-- Dichiarazione: i prezzi dello scontrino sono già IVA compresa.
-- Il totale inserito resta il lordo. Imponibile e IVA si scorporano.

alter table public.spese_documenti
  add column if not exists prezzi_iva_compresa boolean not null default false;

comment on column public.spese_documenti.prezzi_iva_compresa is
  'Se vero, i prezzi di riga sono IVA compresa: il totale è quello inserito e imponibile e IVA sono scorporati.';
