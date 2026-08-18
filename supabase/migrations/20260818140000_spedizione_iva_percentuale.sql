-- ISO 9001: aliquota IVA dedicata alla sola spedizione (non interferisce con le righe)

alter table public.fatture_emesse
  add column if not exists spedizione_iva_percentuale numeric(6, 2) not null default 22;

alter table public.fatture_ricevute
  add column if not exists spedizione_iva_percentuale numeric(6, 2) not null default 22;

alter table public.fatture_emesse
  drop constraint if exists fatture_emesse_spedizione_iva_pct_check;
alter table public.fatture_emesse
  add constraint fatture_emesse_spedizione_iva_pct_check
  check (spedizione_iva_percentuale >= 0 and spedizione_iva_percentuale <= 100);

alter table public.fatture_ricevute
  drop constraint if exists fatture_ricevute_spedizione_iva_pct_check;
alter table public.fatture_ricevute
  add constraint fatture_ricevute_spedizione_iva_pct_check
  check (spedizione_iva_percentuale >= 0 and spedizione_iva_percentuale <= 100);

comment on column public.fatture_emesse.spedizione_iva_percentuale is
  'Aliquota IVA applicata solo alla spedizione se spedizione_iva_applicata; non usata sulle righe.';

comment on column public.fatture_ricevute.spedizione_iva_percentuale is
  'Aliquota IVA applicata solo alla spedizione se spedizione_iva_applicata; non usata sulle righe.';
