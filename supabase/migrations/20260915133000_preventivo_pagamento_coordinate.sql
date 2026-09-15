-- Preventivo: pagamento anticipato, giorni consegna, flag coordinate bancarie (ISO 9001)

alter table public.preventivi
  alter column tipo_pagamento set default 'anticipato';

alter table public.preventivi
  add column if not exists giorni_consegna text not null default 'da concordare';

alter table public.preventivi
  add column if not exists include_coordinate_bancarie boolean not null default false;

alter table public.preventivi
  add column if not exists coordinate_banca text not null default '';

alter table public.preventivi
  add column if not exists coordinate_iban text not null default '';

alter table public.preventivi
  add column if not exists coordinate_bic text not null default '';

comment on column public.preventivi.giorni_consegna is
  'Tempi di consegna sul documento (default: da concordare)';
comment on column public.preventivi.include_coordinate_bancarie is
  'Se true le coordinate bancarie sono stampate in intestazione sotto P.IVA';
comment on column public.preventivi.coordinate_iban is
  'Snapshot IBAN al salvataggio (tracciabilità documento)';
