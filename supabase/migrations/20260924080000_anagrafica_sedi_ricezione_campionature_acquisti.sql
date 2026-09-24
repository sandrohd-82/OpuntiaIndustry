-- Due destinazioni indipendenti: campionature (piccoli pacchi) e acquisti (merce).
-- ISO 9001 §8.5.2: una sola sede attiva per tipo e per azienda. Nessun backfill.
-- Il vecchio ricezione_merce resta inutilizzato (resta false in scrittura).

set lock_timeout = '4s';
set deadlock_timeout = '1s';

alter table public.anagrafica_sedi
  add column if not exists ricezione_campionature boolean not null default false;

alter table public.anagrafica_sedi
  add column if not exists ricezione_acquisti boolean not null default false;

create unique index if not exists anagrafica_sedi_ricezione_camp_uidx
  on public.anagrafica_sedi (owner_kind, owner_id)
  where deleted_at is null and ricezione_campionature = true;

create unique index if not exists anagrafica_sedi_ricezione_acq_uidx
  on public.anagrafica_sedi (owner_kind, owner_id)
  where deleted_at is null and ricezione_acquisti = true;

comment on column public.anagrafica_sedi.ricezione_campionature is
  'Indirizzo standard ricezione campionature (piccoli pacchi). Una sola sede attiva per azienda.';
comment on column public.anagrafica_sedi.ricezione_acquisti is
  'Indirizzo standard ricezione acquisti (quantitativi). Una sola sede attiva per azienda.';
