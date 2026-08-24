-- Estende clienti_possibili con anagrafica allineata a clienti
-- Differenza: prodotti_interessati (non prodotti_acquistati)
-- Nessuna targa C00x sul lead (assegnata solo in conversione)

alter table public.clienti_possibili
  add column if not exists partita_iva text not null default '',
  add column if not exists codice_fiscale text not null default '',
  add column if not exists is_privato boolean not null default false,
  add column if not exists pec text not null default '',
  add column if not exists sdi_code text not null default '',
  add column if not exists sito_web text not null default '',
  add column if not exists sede_amm_nazione text not null default '',
  add column if not exists sede_amm_provincia text not null default '',
  add column if not exists sede_amm_citta text not null default '',
  add column if not exists sede_amm_cap text not null default '',
  add column if not exists sede_amm_indirizzo text not null default '',
  add column if not exists sede_mag_nazione text not null default '',
  add column if not exists sede_mag_provincia text not null default '',
  add column if not exists sede_mag_citta text not null default '',
  add column if not exists sede_mag_cap text not null default '',
  add column if not exists sede_mag_indirizzo text not null default '',
  add column if not exists prodotti_interessati text[] not null default '{}',
  add column if not exists consegne_altra_azienda jsonb not null default '[]'::jsonb;

-- email / telefono già presenti dalla migrazione precedente
comment on column public.clienti_possibili.prodotti_interessati is
  'Codici prodotti propri di interesse (equivalente a prodotti_acquistati sul cliente)';
comment on column public.clienti_possibili.consegne_altra_azienda is
  'Stessa struttura JSON di clienti.consegne_altra_azienda';

create index if not exists clienti_possibili_piva_idx
  on public.clienti_possibili (partita_iva)
  where deleted_at is null and trim(partita_iva) <> '';
