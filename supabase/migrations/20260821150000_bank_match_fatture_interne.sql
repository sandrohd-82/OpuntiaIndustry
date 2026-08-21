-- Riconciliazione banca ↔ fatture interne (emesse/ricevute), non più solo fic_invoices

-- Rimuove FK verso fic_invoices (tabella cache spesso vuota; le fatture operative
-- sono in fatture_emesse / fatture_ricevute).
alter table public.bank_invoice_matches
  drop constraint if exists bank_invoice_matches_invoice_id_fkey;

alter table public.bank_invoice_matches
  add column if not exists invoice_kind text;

alter table public.bank_invoice_matches
  drop constraint if exists bank_invoice_matches_invoice_kind_check;

alter table public.bank_invoice_matches
  add constraint bank_invoice_matches_invoice_kind_check
    check (
      invoice_kind is null
      or invoice_kind in ('emessa', 'ricevuta')
    );

comment on column public.bank_invoice_matches.invoice_kind is
  'Origine fattura: emessa (+) o ricevuta (−). invoice_id punta a fatture_emesse / fatture_ricevute.';

comment on table public.bank_invoice_matches is
  'Riconciliazione movimento banca ↔ fattura interna (emessa/ricevuta). Importo in valore assoluto; segno movimento sceglie il catalogo.';
