-- Codice materia prima: alfanumerico case-sensitive (A–Z, a–z, 0–9)

alter table public.materie_prime
  drop constraint if exists materie_prime_codice_alfanum;

alter table public.materie_prime
  add constraint materie_prime_codice_alfanum
  check (codice ~ '^[A-Za-z0-9]+$');

comment on column public.materie_prime.codice is
  'Codice interno alfanumerico case-sensitive (lettere minuscole/maiuscole e cifre)';
