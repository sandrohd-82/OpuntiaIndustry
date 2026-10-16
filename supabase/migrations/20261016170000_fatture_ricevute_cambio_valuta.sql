-- Cambio fiscale sulle fatture ricevute in valuta estera.
-- Il tasso è unità di valuta estera per 1 euro (listino BCE / Banca d'Italia)
-- del giorno di emissione, o del giorno lavorativo precedente.
-- Importo fiscale EUR = importo in valuta / tasso.

alter table public.fatture_ricevute
  add column if not exists valuta text not null default 'EUR',
  add column if not exists importo_valuta numeric(16, 4),
  add column if not exists tasso_cambio numeric(16, 6),
  add column if not exists tasso_cambio_data date,
  add column if not exists importo_fiscale_eur numeric(14, 2),
  add column if not exists tasso_cambio_fonte text;

alter table public.fatture_ricevute
  drop constraint if exists fatture_ricevute_valuta_check;

alter table public.fatture_ricevute
  add constraint fatture_ricevute_valuta_check
  check (valuta ~ '^[A-Z]{3}$');

alter table public.fatture_ricevute
  drop constraint if exists fatture_ricevute_cambio_check;

alter table public.fatture_ricevute
  add constraint fatture_ricevute_cambio_check
  check (
    (
      valuta = 'EUR'
      and importo_valuta is null
      and tasso_cambio is null
      and tasso_cambio_data is null
      and importo_fiscale_eur is null
      and tasso_cambio_fonte is null
    )
    or (
      valuta <> 'EUR'
      and importo_valuta > 0
      and tasso_cambio > 0
      and tasso_cambio_data is not null
      and tasso_cambio_data <= data_emissione
      and importo_fiscale_eur >= 0
      and tasso_cambio_fonte in ('AUTO_ECB', 'MANUAL_OPERATOR')
    )
  );

comment on column public.fatture_ricevute.valuta is
  'ISO 4217. EUR se la fattura è già in euro.';
comment on column public.fatture_ricevute.importo_valuta is
  'Totale del documento nella valuta estera, prima della conversione.';
comment on column public.fatture_ricevute.tasso_cambio is
  'Unità di valuta estera per 1 euro, listino BCE della data fattura o del giorno lavorativo precedente.';
comment on column public.fatture_ricevute.tasso_cambio_data is
  'Giorno del listino applicato. Non è la data di registrazione né di pagamento.';
comment on column public.fatture_ricevute.importo_fiscale_eur is
  'Importo fiscale: importo_valuta / tasso_cambio, arrotondato al centesimo.';
comment on column public.fatture_ricevute.tasso_cambio_fonte is
  'AUTO_ECB se letto dal servizio, MANUAL_OPERATOR se inserito dall''operatore.';
