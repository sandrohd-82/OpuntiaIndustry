-- Delega dell'invio all'operatore che mette l'ordine in produzione.
-- La bozza resta salvata. Numero, SDI e mail partono solo al processo.

alter table public.ordini
  add column if not exists invio_delegato boolean not null default false;

alter table public.ordini
  add column if not exists invio_delegato_at timestamptz;

alter table public.ordini
  add column if not exists invio_delegato_by uuid;

alter table public.ordini
  add column if not exists invio_delegato_inviato_at timestamptz;

alter table public.ordini
  add column if not exists invio_delegato_inviato_by uuid;

comment on column public.ordini.invio_delegato is
  'Il commerciale ha delegato l''invio all''operatore di produzione. La bozza è salvata e non parte in finalizzazione.';

comment on column public.ordini.invio_delegato_at is
  'Quando è stata registrata la delega di invio.';

comment on column public.ordini.invio_delegato_by is
  'Chi ha delegato l''invio.';

comment on column public.ordini.invio_delegato_inviato_at is
  'Quando l''operatore di produzione ha confermato l''invio della bozza delegata.';

comment on column public.ordini.invio_delegato_inviato_by is
  'Operatore che ha confermato l''invio delegato.';
