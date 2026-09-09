-- Stato Pre-operativo: controllo impostazioni dopo il test.
-- Identico al test (niente login, niente mail) ma UI come operativo.
-- ISO 9001: stato documentato, chi/quando già su stato_operativo_at / _by.

alter table public.profiles
  drop constraint if exists profiles_stato_operativo_check;

alter table public.profiles
  add constraint profiles_stato_operativo_check
  check (
    stato_operativo in (
      'test',
      'pre_operativo',
      'operativo',
      'sospeso',
      'bloccato'
    )
  );

comment on column public.profiles.stato_operativo is
  'LED: test (configurazione), pre_operativo (anteprima operativa, niente mail/login), operativo, sospeso, bloccato. Login autonomo solo se operativo.';
