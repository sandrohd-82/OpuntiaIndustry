-- Numero pezzi e prezzo unitario sulle righe dello scontrino.
-- L'imponibile di riga resta prezzo × numero. Nessuna cancellazione fisica.

alter table public.spese_documenti_righe
  add column if not exists quantita numeric(14, 3) not null default 1,
  add column if not exists prezzo_unitario numeric(14, 2) not null default 0;

update public.spese_documenti_righe
set prezzo_unitario = imponibile
where prezzo_unitario = 0
  and imponibile > 0;

alter table public.spese_documenti_righe
  drop constraint if exists spese_documenti_righe_quantita_check;

alter table public.spese_documenti_righe
  add constraint spese_documenti_righe_quantita_check check (
    quantita > 0
    and prezzo_unitario >= 0
  );

comment on column public.spese_documenti_righe.quantita is
  'Numero di pezzi della riga. L''imponibile è prezzo unitario × quantita.';

comment on column public.spese_documenti_righe.prezzo_unitario is
  'Prezzo del singolo pezzo, prima dell''IVA di riga.';
