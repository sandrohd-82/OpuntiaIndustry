-- Sconto standard di riga: origine di listino e percentuale applicata (solo riduzione).

alter table public.preventivi_righe
  add column if not exists sconto_listino_standard_pct numeric(6,2) not null default 0,
  add column if not exists sconto_listino_pct numeric(6,2) not null default 0;

alter table public.preventivi_righe
  drop constraint if exists preventivi_righe_sconto_listino_range;

alter table public.preventivi_righe
  add constraint preventivi_righe_sconto_listino_range
  check (
    sconto_listino_standard_pct >= 0
    and sconto_listino_standard_pct <= 100
    and sconto_listino_pct >= 0
    and sconto_listino_pct <= sconto_listino_standard_pct
  );

comment on column public.preventivi_righe.sconto_listino_standard_pct is
  'Sconto di listino della confezione scelta. Non si alza dalla riga.';
comment on column public.preventivi_righe.sconto_listino_pct is
  'Sconto standard applicato: da 0 fino allo sconto di listino. 0 = annullato.';
