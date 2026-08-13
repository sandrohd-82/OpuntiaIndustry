-- Storno riga in fattura: quantità negativa, prezzo unitario resta >= 0
-- (stesso modello delle note di credito sulle emesse).

alter table public.fatture_ricevute_righe
  drop constraint if exists fatture_ricevute_righe_qta_check;

comment on column public.fatture_ricevute_righe.quantita is
  'Quantità riga: positiva in fattura, negativa per storno/annullamento voce';

comment on column public.fatture_emesse_righe.quantita is
  'Quantità riga: positiva in fattura, negativa per storno o nota di credito';
