-- Prefisso fisso Mp per tutte le materie prime (come F per i fornitori)

-- Normalizza eventuali codici senza prefisso Mp
update public.materie_prime
set codice = 'Mp' || codice
where codice !~ '^Mp';

alter table public.materie_prime
  drop constraint if exists materie_prime_codice_alfanum;

alter table public.materie_prime
  add constraint materie_prime_codice_alfanum
  check (codice ~ '^Mp[A-Za-z0-9\-_\/]+$');

comment on column public.materie_prime.codice is
  'Codice interno con prefisso fisso Mp + corpo alfanumerico (- _ / ammessi)';
