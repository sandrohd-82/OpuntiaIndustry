-- ISO 9001: lotto sulla riga ordine. In campionatura è facoltativo in
-- creazione; si indica in processazione (scaletta / produzione).

alter table public.ordini_righe
  add column if not exists lotto_codice text not null default '';

comment on column public.ordini_righe.lotto_codice is
  'Numero lotto. Campionatura: facoltativo in creazione, compilabile in processazione.';
