-- Ordine: sconto di listino e confezione commerciale, come sul preventivo.
-- Lo sconto applicato non supera quello di listino. Un aumento passa dallo sconto extra.

alter table public.ordini_righe
  add column if not exists sconto_listino_standard_pct numeric(6,2) not null default 0,
  add column if not exists sconto_listino_pct numeric(6,2) not null default 0,
  add column if not exists confezionamento text not null default '',
  add column if not exists imballaggio_voce_id uuid;

alter table public.ordini_righe
  drop constraint if exists ordini_righe_sconto_listino_range;

alter table public.ordini_righe
  add constraint ordini_righe_sconto_listino_range
  check (
    sconto_listino_standard_pct >= 0
    and sconto_listino_standard_pct <= 100
    and sconto_listino_pct >= 0
    and sconto_listino_pct <= sconto_listino_standard_pct
  );

comment on column public.ordini_righe.sconto_listino_standard_pct is
  'Sconto di listino della confezione. Dal preventivo collegato oppure calcolato sulla quantità.';
comment on column public.ordini_righe.sconto_listino_pct is
  'Sconto standard applicato: da 0 fino allo sconto di listino.';
comment on column public.ordini_righe.confezionamento is
  'Confezione commerciale usata per lo sconto (testo). Il confezionamento di produzione resta a parte.';
comment on column public.ordini_righe.imballaggio_voce_id is
  'Voce imballo della confezione commerciale, se presente.';
