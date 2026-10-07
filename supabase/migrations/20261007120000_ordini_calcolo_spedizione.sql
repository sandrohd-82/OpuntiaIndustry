-- Ordine diretto: richiesta calcolo spedizione, come il preventivo.
-- Finché la modalità è "richiesto" non partono fattura, proforma né mail al cliente.

alter table public.ordini
  add column if not exists modalita_spedizione_prezzo text not null default 'non_applicabile',
  add column if not exists spedizione_importo numeric(14,2) not null default 0,
  add column if not exists spedizione_iva_modo text not null default 'piu_iva',
  add column if not exists spedizione_calcolata_at timestamptz,
  add column if not exists spedizione_calcolata_by uuid;

alter table public.ordini drop constraint if exists ordini_modalita_spedizione_prezzo_check;
alter table public.ordini
  add constraint ordini_modalita_spedizione_prezzo_check
  check (modalita_spedizione_prezzo in ('non_applicabile', 'inserito', 'richiesto'));

alter table public.ordini drop constraint if exists ordini_spedizione_iva_modo_check;
alter table public.ordini
  add constraint ordini_spedizione_iva_modo_check
  check (spedizione_iva_modo in ('compreso', 'piu_iva'));

alter table public.ordini drop constraint if exists ordini_spedizione_importo_nonneg;
alter table public.ordini
  add constraint ordini_spedizione_importo_nonneg
  check (spedizione_importo >= 0);

comment on column public.ordini.modalita_spedizione_prezzo is
  'non_applicabile: spedizione non a carico cliente. inserito: importo già noto. richiesto: attesa operatore calcolo spedizioni; fattura e mail al cliente bloccate.';
comment on column public.ordini.spedizione_importo is
  'Importo spedizione a carico cliente. 0 finché il calcolo è richiesto.';
comment on column public.ordini.spedizione_iva_modo is
  'compreso: importo IVA inclusa. piu_iva: importo imponibile più IVA.';
