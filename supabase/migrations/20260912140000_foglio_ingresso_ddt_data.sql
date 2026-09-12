-- Data documento DDT sul foglio ingresso MP (ISO: audit sul foglio, soft delete invariato).

alter table public.produzione_fogli_ingresso_mp
  add column if not exists ddt_data date;

comment on column public.produzione_fogli_ingresso_mp.ddt_data is
  'Data del DDT produttore (documento), distinta da arrivato_at.';
