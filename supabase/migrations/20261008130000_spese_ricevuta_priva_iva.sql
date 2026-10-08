-- Scontrino dichiarato privo di IVA (taxi e simili): imposta zero, partita IVA facoltativa.

alter table public.spese_documenti
  add column if not exists priva_iva boolean not null default false;

alter table public.spese_documenti
  drop constraint if exists spese_documenti_priva_iva_check;

alter table public.spese_documenti
  add constraint spese_documenti_priva_iva_check
  check (priva_iva = false or (imposta = 0 and aliquota_iva = 0));

comment on column public.spese_documenti.priva_iva is
  'True se l’operatore dichiara una ricevuta senza IVA, es. taxi. La partita IVA può restare vuota.';
