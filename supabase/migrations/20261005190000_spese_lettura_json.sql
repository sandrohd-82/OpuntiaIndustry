-- Lettura scontrino: JSON conservato e uscita interpretata (ISO 9001 7.5).

alter table public.spese_documenti
  add column if not exists lettura_json jsonb,
  add column if not exists uscita_importo numeric(14, 2),
  add column if not exists iva_detraibile boolean not null default false,
  add column if not exists valenza_fiscale text not null default '';

comment on column public.spese_documenti.lettura_json is
  'JSON della lettura (righe, imponibile, IVA, totale). Non si cancella con la registrazione.';
comment on column public.spese_documenti.uscita_importo is
  'Importo uscito di cassa: il totale pagato.';
comment on column public.spese_documenti.iva_detraibile is
  'True solo se il documento è una fattura. Lo scontrino non dà credito IVA.';
comment on column public.spese_documenti.valenza_fiscale is
  'fiscale se riporta la P.IVA della cooperativa, commerciale se è solo uno scontrino, fattura se è XML.';
