-- Lo sconto standard dell'ordine può essere più alto di quello di listino.
-- I due valori restano distinti: listino = origine, standard = valore impostato.
-- L'extra resta un secondo sconto, calcolato sul prezzo già scontato.
-- Nessuna riga viene cancellata. I valori già salvati restano validi.

alter table public.ordini_righe
  drop constraint if exists ordini_righe_sconto_listino_range;

alter table public.ordini_righe
  add constraint ordini_righe_sconto_listino_range
  check (
    sconto_listino_standard_pct >= 0
    and sconto_listino_standard_pct <= 100
    and sconto_listino_pct >= 0
    and sconto_listino_pct <= 100
  );

comment on column public.ordini_righe.sconto_listino_standard_pct is
  'Sconto di listino della confezione, oppure quello del preventivo. Può essere inferiore allo sconto standard impostato.';
comment on column public.ordini_righe.sconto_listino_pct is
  'Sconto standard impostato sull''ordine, da 0 a 100, anche se supera il listino.';
