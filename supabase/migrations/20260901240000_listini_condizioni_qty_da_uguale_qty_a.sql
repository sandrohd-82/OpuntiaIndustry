-- ISO 9001 10.2: il dominio già confermato ammette Qty da = Qty a
-- (sconto per un solo formato, es. un bigbag da 500 kg).
-- Il CHECK precedente (qty_a > qty_da) faceva fallire il Salva prodotto
-- e perdeva le condizioni nuove in bozza.

alter table public.listini_righe_condizioni
  drop constraint if exists listini_righe_condizioni_qty_a_check;

alter table public.listini_righe_condizioni
  add constraint listini_righe_condizioni_qty_a_check
  check (qty_a is null or qty_a >= qty_da);

comment on column public.listini_righe_condizioni.qty_a is
  'Quantità massima inclusa; null = nessuno tetto; uguale a qty_da = sconto solo per quella quantità.';
