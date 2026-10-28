-- Avviso ritiro: contenuti della mail e scelta di non inviare alcuna mail.
-- I dati restano sull'ordine e seguono le fasi di lavorazione. Nessuna cancellazione fisica.

alter table public.ordini
  add column if not exists avviso_includi_orari boolean not null default false;

alter table public.ordini
  add column if not exists avviso_includi_sede boolean not null default false;

alter table public.ordini
  add column if not exists avviso_includi_misure boolean not null default false;

alter table public.ordini
  add column if not exists avviso_includi_peso boolean not null default false;

alter table public.ordini
  add column if not exists nessuna_mail boolean not null default false;

comment on column public.ordini.avviso_includi_orari is
  'La mail di merce pronta include gli orari di ritiro.';

comment on column public.ordini.avviso_includi_sede is
  'La mail di merce pronta include la sede di ritiro.';

comment on column public.ordini.avviso_includi_misure is
  'La mail di merce pronta include le misure del collo.';

comment on column public.ordini.avviso_includi_peso is
  'La mail di merce pronta include il peso del collo.';

comment on column public.ordini.nessuna_mail is
  'In finalizzazione è stato scelto di non inviare alcuna mail: né cortesia, né fattura, né tracking.';
