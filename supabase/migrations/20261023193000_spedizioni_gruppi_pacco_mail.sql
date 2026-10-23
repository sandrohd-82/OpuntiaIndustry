-- Scelte di raggruppamento: un solo pacco e una sola mail di tracking.
-- ISO 9001 §7.5: la scelta resta sul gruppo, i documenti restano distinti.

alter table public.spedizioni_gruppi
  add column if not exists unico_pacco boolean not null default false;

alter table public.spedizioni_gruppi
  add column if not exists unica_mail boolean not null default false;

comment on column public.spedizioni_gruppi.unico_pacco is
  'True se tutti i documenti del gruppo viaggiano nello stesso pacco.';

comment on column public.spedizioni_gruppi.unica_mail is
  'True se parte una sola mail con un solo tracking per tutto il gruppo.';
