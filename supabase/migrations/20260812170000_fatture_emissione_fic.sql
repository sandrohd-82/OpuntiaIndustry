-- Emissione fatture Opuntia → FiC (ISO 9001): campi tracciabilità, PDF, SDI, righe IVA/spedizione

-- ---------------------------------------------------------------------------
-- fatture_emesse: metadati emissione
-- ---------------------------------------------------------------------------
alter table public.fatture_emesse
  add column if not exists numero_fattura text not null default '',
  add column if not exists pdf_url text not null default '',
  add column if not exists ei_status text not null default '',
  add column if not exists payment_method text not null default 'MP05',
  add column if not exists iban text not null default '',
  add column if not exists data_scadenza date,
  add column if not exists ordine_id uuid references public.ordini (id) on delete set null,
  add column if not exists courtesy_email_sent boolean not null default false,
  add column if not exists emissione_errore text not null default '';

comment on column public.fatture_emesse.numero_fattura is
  'Numero gestionale senza prefisso Ft- (es. 26-C005/1). numero_interno resta Ft-26-C005/1';
comment on column public.fatture_emesse.pdf_url is
  'URL PDF temporaneo/persistito da Fatture in Cloud dopo emissione';
comment on column public.fatture_emesse.ei_status is
  'Stato e-fattura FiC/SDI (es. pending, sent, delivered, rejected)';
comment on column public.fatture_emesse.payment_method is
  'Codice metodo pagamento SDI (MP05 bonifico, MP01 contanti, …)';
comment on column public.fatture_emesse.ordine_id is
  'Collegamento opzionale a ordine (lotto/spedizione operativo)';

create index if not exists fatture_emesse_numero_fattura_idx
  on public.fatture_emesse (numero_fattura)
  where deleted_at is null;

create index if not exists fatture_emesse_ordine_id_idx
  on public.fatture_emesse (ordine_id)
  where deleted_at is null and ordine_id is not null;

-- ---------------------------------------------------------------------------
-- fatture_emesse_righe: IVA per riga + flag spedizione + note prodotto
-- ---------------------------------------------------------------------------
alter table public.fatture_emesse_righe
  add column if not exists iva_percentuale numeric(6, 2) not null default 22,
  add column if not exists is_spedizione boolean not null default false,
  add column if not exists note text not null default '';

alter table public.fatture_emesse_righe drop constraint if exists fatture_emesse_righe_iva_check;
alter table public.fatture_emesse_righe
  add constraint fatture_emesse_righe_iva_check
  check (iva_percentuale >= 0 and iva_percentuale <= 100);

comment on column public.fatture_emesse_righe.is_spedizione is
  'Riga spedizione trattata come prodotto; IVA on/off via iva_percentuale';
comment on column public.fatture_emesse_righe.note is
  'Note prodotto (in descrizione FiC sotto il nome, meno evidenziate in UI)';

-- ---------------------------------------------------------------------------
-- fic_invoices: collegamento cliente + fattura locale + PDF
-- ---------------------------------------------------------------------------
alter table public.fic_invoices
  add column if not exists cliente_id uuid references public.clienti (id) on delete set null,
  add column if not exists fattura_emessa_id uuid references public.fatture_emesse (id) on delete set null,
  add column if not exists pdf_url text not null default '',
  add column if not exists ei_status text not null default '';

create index if not exists fic_invoices_cliente_id_idx
  on public.fic_invoices (cliente_id)
  where deleted_at is null and cliente_id is not null;

create index if not exists fic_invoices_fattura_emessa_id_idx
  on public.fic_invoices (fattura_emessa_id)
  where deleted_at is null and fattura_emessa_id is not null;
