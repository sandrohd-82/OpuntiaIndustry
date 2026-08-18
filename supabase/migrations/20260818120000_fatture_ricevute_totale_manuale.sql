-- ISO 9001: totale ricevuta forzabile (allineamento FiC) con tracciabilità

alter table public.fatture_ricevute
  add column if not exists totale_manuale boolean not null default false;

alter table public.fatture_ricevute
  add column if not exists totale_forzato_at timestamptz;

alter table public.fatture_ricevute
  add column if not exists totale_forzato_by uuid references auth.users (id) on delete set null;

comment on column public.fatture_ricevute.totale_manuale is
  'Se true, il totale documento è stato forzato manualmente (può non coincidere con le righe).';

comment on column public.fatture_ricevute.totale_forzato_at is
  'Quando è stato impostato/aggiornato un totale manuale.';

comment on column public.fatture_ricevute.totale_forzato_by is
  'Utente che ha forzato il totale (audit ISO).';
