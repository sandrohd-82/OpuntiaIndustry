-- Documento originale della fattura ricevuta (PDF o foto del fornitore).
-- Distinto dalla copia di pagamento in ricevuta_storage_path.
-- ISO 9001: il file resta collegato; una sostituzione aggiorna il puntatore
-- e l'audit conserva il percorso precedente. Nessuna cancellazione della fattura.

alter table public.fatture_ricevute
  add column if not exists documento_originale_storage_path text not null default '',
  add column if not exists documento_originale_file_name text not null default '';

comment on column public.fatture_ricevute.documento_originale_storage_path is
  'Percorso nel bucket fatture-ricevute-pagamenti del PDF o della foto originale. Vuoto se non caricato.';
comment on column public.fatture_ricevute.documento_originale_file_name is
  'Nome del file originale mostrato in scheda.';
