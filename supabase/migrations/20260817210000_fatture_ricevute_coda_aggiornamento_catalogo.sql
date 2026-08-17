-- Flag fatture ricevute da aggiornare dopo eliminazione/modifica catalogo (coda tipo sync)

alter table public.fatture_ricevute
  add column if not exists richiede_aggiornamento_catalogo boolean not null default false;

alter table public.fatture_ricevute
  add column if not exists codice_catalogo_pending text;

comment on column public.fatture_ricevute.richiede_aggiornamento_catalogo is
  'Documento in coda revisione (come sync): riassegnare codici prima di chiudere eliminazione catalogo.';

comment on column public.fatture_ricevute.codice_catalogo_pending is
  'Codice catalogo in eliminazione ancora presente sulle righe (se valorizzato).';

create index if not exists fatture_ricevute_da_aggiornare_idx
  on public.fatture_ricevute (richiede_aggiornamento_catalogo)
  where richiede_aggiornamento_catalogo = true and deleted_at is null;
