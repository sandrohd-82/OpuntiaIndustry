-- ISO 9001 §8.5.2: un solo indirizzo standard di ricezione merce per azienda.
-- Default false: le anagrafiche già caricate restano senza selezione.

alter table public.anagrafica_sedi
  add column if not exists ricezione_merce boolean not null default false;

create unique index if not exists anagrafica_sedi_ricezione_unica_idx
  on public.anagrafica_sedi (owner_kind, owner_id)
  where deleted_at is null and ricezione_merce = true;

comment on column public.anagrafica_sedi.ricezione_merce is
  'Indirizzo standard di ricezione merce e campionature. Una sola sede attiva per azienda. Impostato dall’operatore.';

alter table public.ordini
  add column if not exists destinatario text not null default '',
  add column if not exists indirizzo_spedizione text not null default '';

comment on column public.ordini.destinatario is
  'Destinatario spedizione merce. Default da sede ricezione merce se selezionata.';
comment on column public.ordini.indirizzo_spedizione is
  'Indirizzo spedizione merce. Default da sede ricezione merce se selezionata. Nessun backfill sulle anagrafiche esistenti.';
