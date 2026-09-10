-- ISO 9001: unità della quantità riga (vendita kg/lt; campionatura default g/ml).

alter table public.ordini_righe
  add column if not exists unita_misura text not null default 'kg';

do $$ begin
  alter table public.ordini_righe
    add constraint ordini_righe_unita_misura_check
    check (unita_misura in ('g', 'kg', 'ml', 'lt'));
exception
  when duplicate_object then null;
end $$;

comment on column public.ordini_righe.unita_misura is
  'Unità della quantità: g|kg (massa) o ml|lt (volume). Campionatura default g/ml.';

-- Invio campionatura: stessa coppia ml/lt per i prodotti a volume.
alter table public.campionature_righe
  drop constraint if exists campionature_righe_um_check;

alter table public.campionature_righe
  add constraint campionature_righe_um_check
  check (unita_misura in ('g', 'kg', 'pz', 'ml', 'lt'));
