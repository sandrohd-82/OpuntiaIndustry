-- Fornitori: Codice Fiscale distinto da P.IVA (ISO 9001 anagrafica)

alter table public.fornitori
  add column if not exists codice_fiscale text not null default '';

comment on column public.fornitori.codice_fiscale is
  'Codice fiscale fornitore (obbligatorio in scheda, distinto da partita_iva)';

-- Backfill: se assente, ripropone la P.IVA (spesso coincidono o era l’unico dato)
update public.fornitori
set codice_fiscale = trim(partita_iva)
where trim(coalesce(codice_fiscale, '')) = ''
  and trim(coalesce(partita_iva, '')) <> '';

create index if not exists fornitori_codice_fiscale_active_idx
  on public.fornitori (upper(trim(codice_fiscale)))
  where deleted_at is null and trim(codice_fiscale) <> '';
