-- Indirizzo estero: livello territoriale extra (distretto, quartiere, colonia).
-- Fornitore: stessa lingua di conversazione già usata su cliente e possibile cliente.
-- Le righe già presenti restano Italia/vuote, senza toccare updated_at.

alter table public.fornitori
  add column if not exists sede_amm_localita text not null default '';
alter table public.fornitori
  add column if not exists sede_mag_localita text not null default '';
alter table public.fornitori
  add column if not exists lingua_intercomunicazione text not null default 'it';

alter table public.fornitori
  drop constraint if exists fornitori_lingua_intercomunicazione_chk;
alter table public.fornitori
  add constraint fornitori_lingua_intercomunicazione_chk
  check (lingua_intercomunicazione ~ '^[a-z]{2}$');

comment on column public.fornitori.sede_amm_localita is
  'Livello territoriale extra della sede amministrativa (distretto, quartiere, colonia). Vuoto se il Paese non lo usa.';
comment on column public.fornitori.sede_mag_localita is
  'Livello territoriale extra della sede di ritiro. Vuoto se il Paese non lo usa.';
comment on column public.fornitori.lingua_intercomunicazione is
  'Lingua di conversazione. L''operatore scrive in italiano; un''altra lingua abilita la copia Traduci.';

alter table public.clienti
  add column if not exists sede_amm_localita text not null default '';
alter table public.clienti
  add column if not exists sede_mag_localita text not null default '';

alter table public.clienti_possibili
  add column if not exists sede_amm_localita text not null default '';
alter table public.clienti_possibili
  add column if not exists sede_mag_localita text not null default '';

alter table public.anagrafica_sedi
  add column if not exists localita text not null default '';

comment on column public.clienti.sede_amm_localita is
  'Livello territoriale extra della sede amministrativa. Vuoto se il Paese non lo usa.';
comment on column public.clienti.sede_mag_localita is
  'Livello territoriale extra della sede magazzino. Vuoto se il Paese non lo usa.';
comment on column public.clienti_possibili.sede_amm_localita is
  'Livello territoriale extra della sede amministrativa. Vuoto se il Paese non lo usa.';
comment on column public.clienti_possibili.sede_mag_localita is
  'Livello territoriale extra della sede magazzino. Vuoto se il Paese non lo usa.';
comment on column public.anagrafica_sedi.localita is
  'Livello territoriale extra. Vuoto se il Paese non lo usa.';

notify pgrst, 'reload schema';
