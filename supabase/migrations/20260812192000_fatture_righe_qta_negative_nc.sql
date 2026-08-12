-- Note di credito: quantità riga negativa (prezzo unitario resta >= 0)
-- Era: quantita >= 0 → bloccava registrazione NC

alter table public.fatture_emesse_righe
  drop constraint if exists fatture_emesse_righe_qta_check;

-- Nessun vincolo di segno: fatture (qta > 0) e note di credito (qta < 0)
comment on column public.fatture_emesse_righe.quantita is
  'Quantità riga: positiva in fattura, negativa in nota di credito';
