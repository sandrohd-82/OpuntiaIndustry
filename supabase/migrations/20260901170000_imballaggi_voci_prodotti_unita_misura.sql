-- Unità di misura sul collegamento isolamento/confezione ↔ prodotto

alter table public.imballaggi_voci_prodotti
  add column if not exists unita_misura text not null default 'kg';

update public.imballaggi_voci_prodotti
set unita_misura = 'kg'
where unita_misura is null or btrim(unita_misura) = '';

alter table public.imballaggi_voci_prodotti
  drop constraint if exists imballaggi_voci_prodotti_um_check;

alter table public.imballaggi_voci_prodotti
  add constraint imballaggi_voci_prodotti_um_check
  check (unita_misura in ('kg', 'g', 'lt', 'ml', 'pz'));

comment on column public.imballaggi_voci_prodotti.unita_misura is
  'UM della capacità max (max_kg) per quel prodotto nella voce';
comment on column public.imballaggi_voci_prodotti.max_kg is
  'Quantità massima inseribile nella voce, espressa in unita_misura';
