-- Fatture ricevute: IVA e unità di misura per riga (ISO 9001)

alter table public.fatture_ricevute_righe
  add column if not exists iva_percentuale numeric(6, 2) not null default 22;

alter table public.fatture_ricevute_righe
  add column if not exists unita_misura text not null default 'NR';

update public.fatture_ricevute_righe r
set iva_percentuale = coalesce(
  (
    select fr.iva_percentuale
    from public.fatture_ricevute fr
    where fr.id = r.fattura_id
  ),
  22
)
where r.iva_percentuale is null
   or r.iva_percentuale = 22;

alter table public.fatture_ricevute_righe
  drop constraint if exists fatture_ricevute_righe_iva_check;

alter table public.fatture_ricevute_righe
  add constraint fatture_ricevute_righe_iva_check
  check (iva_percentuale >= 0 and iva_percentuale <= 100);

comment on column public.fatture_ricevute_righe.iva_percentuale is
  'Aliquota IVA della riga (può differire tra prodotti).';

comment on column public.fatture_ricevute_righe.unita_misura is
  'Unità di misura della quantità (es. NR, KG, H) da fattura/SDI.';
