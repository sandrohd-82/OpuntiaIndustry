-- Lingua di intercomunicazione su cliente e possibile cliente.
-- Il valore di default 'it' vale anche per le schede già presenti, senza
-- riscrivere updated_at. L'operatore continua a compilare in italiano.

alter table public.clienti
  add column if not exists lingua_intercomunicazione text not null default 'it';

alter table public.clienti
  drop constraint if exists clienti_lingua_intercomunicazione_chk;

alter table public.clienti
  add constraint clienti_lingua_intercomunicazione_chk
  check (lingua_intercomunicazione ~ '^[a-z]{2}$');

comment on column public.clienti.lingua_intercomunicazione is
  'Lingua di intercomunicazione. L''operatore scrive in italiano; un''altra lingua abilita solo la copia Traduci.';

alter table public.clienti_possibili
  add column if not exists lingua_intercomunicazione text not null default 'it';

alter table public.clienti_possibili
  drop constraint if exists clienti_possibili_lingua_intercomunicazione_chk;

alter table public.clienti_possibili
  add constraint clienti_possibili_lingua_intercomunicazione_chk
  check (lingua_intercomunicazione ~ '^[a-z]{2}$');

comment on column public.clienti_possibili.lingua_intercomunicazione is
  'Lingua di intercomunicazione. L''operatore scrive in italiano; un''altra lingua abilita solo la copia Traduci.';

notify pgrst, 'reload schema';
