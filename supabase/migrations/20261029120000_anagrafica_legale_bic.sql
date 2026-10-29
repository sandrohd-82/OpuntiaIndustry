-- BIC e legale rappresentante dell'anagrafica, scritti anche sulla scheda cliente.

alter table public.clienti
  add column if not exists banca_bic text not null default '',
  add column if not exists legale_cognome text not null default '',
  add column if not exists legale_nome text not null default '',
  add column if not exists legale_tel text not null default '',
  add column if not exists legale_email text not null default '';

alter table public.clienti_possibili
  add column if not exists banca_bic text not null default '',
  add column if not exists legale_cognome text not null default '',
  add column if not exists legale_nome text not null default '',
  add column if not exists legale_tel text not null default '',
  add column if not exists legale_email text not null default '';

comment on column public.clienti.banca_bic is
  'BIC/SWIFT della banca di appoggio dichiarata in anagrafica.';
comment on column public.clienti.legale_email is
  'E-mail del legale rappresentante firmatario dell''anagrafica.';
