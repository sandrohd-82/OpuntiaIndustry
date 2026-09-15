-- Campionatura: origine da_inviare | storico + tracking URL + mezzo non_ricordo
-- ISO 9001 §8.5.2: storico già inviata (stato inviata), non entra in coda da processare.

alter table public.campionature
  add column if not exists origine text not null default 'da_inviare';

alter table public.campionature
  drop constraint if exists campionature_origine_check;

alter table public.campionature
  add constraint campionature_origine_check
  check (origine in ('da_inviare', 'storico'));

alter table public.campionature
  add column if not exists tracking_url text not null default '';

alter table public.campionature
  drop constraint if exists campionature_mezzo_check;

alter table public.campionature
  add constraint campionature_mezzo_check
  check (
    mezzo is null
    or mezzo in (
      'mail',
      'messaggio',
      'chiamata',
      'in_presenza',
      'non_ricordo'
    )
  );

comment on column public.campionature.origine is
  'da_inviare = da processare; storico = già inviata, solo registro + timeline';
comment on column public.campionature.tracking_url is
  'URL tracking facoltativo (storico); monitoraggio via shipping_trackings';

alter table public.shipping_trackings
  drop constraint if exists shipping_trackings_entity_type_check;

alter table public.shipping_trackings
  add constraint shipping_trackings_entity_type_check
  check (
    entity_type is null
    or entity_type in (
      'cliente',
      'fornitore',
      'cliente_possibile',
      'ordine',
      'campionatura',
      'altro'
    )
  );
