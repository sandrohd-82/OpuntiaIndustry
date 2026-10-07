-- Il commerciale può affidare il confezionamento standard alla produzione
-- senza indicare imballi. ISO 9001 §7.5 / §8.5.2: la scelta resta registrata.

alter table public.ordini_confezionamento
  add column if not exists affidato_produzione boolean not null default false;

comment on column public.ordini_confezionamento.affidato_produzione is
  'True se il commerciale ha scelto il confezionamento standard affidato all''operatore di produzione, senza imballi.';
