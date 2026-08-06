-- Codice materia prima: alfanumerico + caratteri speciali - _ /

alter table public.materie_prime
  drop constraint if exists materie_prime_codice_alfanum;

alter table public.materie_prime
  add constraint materie_prime_codice_alfanum
  check (codice ~ '^[A-Za-z0-9\-_\/]+$');

comment on column public.materie_prime.codice is
  'Codice interno case-sensitive: lettere, cifre e caratteri - _ /';
