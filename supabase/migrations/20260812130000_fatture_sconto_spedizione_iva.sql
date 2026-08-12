-- Fatture: sconto % per riga + IVA opzionale su spedizione (default mai applicata)

-- ---------------------------------------------------------------------------
-- Testata: flag IVA spedizione
-- ---------------------------------------------------------------------------
alter table public.fatture_emesse
  add column if not exists spedizione_iva_applicata boolean not null default false;

alter table public.fatture_ricevute
  add column if not exists spedizione_iva_applicata boolean not null default false;

comment on column public.fatture_emesse.spedizione_iva_applicata is
  'Se true la spedizione entra nella base IVA; default false (IVA non applicata al trasporto)';
comment on column public.fatture_ricevute.spedizione_iva_applicata is
  'Se true la spedizione entra nella base IVA; default false (IVA non applicata al trasporto)';

-- ---------------------------------------------------------------------------
-- Righe: sconto percentuale
-- ---------------------------------------------------------------------------
alter table public.fatture_emesse_righe
  add column if not exists sconto_percentuale numeric(6, 2) not null default 0;

alter table public.fatture_ricevute_righe
  add column if not exists sconto_percentuale numeric(6, 2) not null default 0;

alter table public.fatture_emesse_righe drop constraint if exists fatture_emesse_righe_sconto_check;
alter table public.fatture_emesse_righe
  add constraint fatture_emesse_righe_sconto_check
  check (sconto_percentuale >= 0 and sconto_percentuale <= 100);

alter table public.fatture_ricevute_righe drop constraint if exists fatture_ricevute_righe_sconto_check;
alter table public.fatture_ricevute_righe
  add constraint fatture_ricevute_righe_sconto_check
  check (sconto_percentuale >= 0 and sconto_percentuale <= 100);

comment on column public.fatture_emesse_righe.sconto_percentuale is
  'Sconto % sul prezzo unitario di listino; importo = qtà × prezzo scontato';
comment on column public.fatture_ricevute_righe.sconto_percentuale is
  'Sconto % sul prezzo unitario di listino; importo = qtà × prezzo scontato';
