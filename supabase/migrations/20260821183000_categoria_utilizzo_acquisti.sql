-- Categoria di utilizzo articoli acquistati (Mp / Pr)
-- Mat. Consumo | Mat. Poco Consumo → magazzino
-- Acquisti Occasionali → nessun magazzino

alter table public.materie_prime
  add column if not exists categoria_utilizzo text;

alter table public.materie_prime
  drop constraint if exists materie_prime_categoria_utilizzo_check;
alter table public.materie_prime
  add constraint materie_prime_categoria_utilizzo_check
  check (
    categoria_utilizzo is null
    or categoria_utilizzo in (
      'mat_consumo',
      'mat_poco_consumo',
      'acquisti_occasionali'
    )
  );

comment on column public.materie_prime.categoria_utilizzo is
  'Utilizzo: mat_consumo | mat_poco_consumo | acquisti_occasionali (null = da classificare)';

alter table public.catalogo_prodotti_fornitore
  add column if not exists categoria_utilizzo text;

alter table public.catalogo_prodotti_fornitore
  drop constraint if exists catalogo_prodotti_fornitore_categoria_utilizzo_check;
alter table public.catalogo_prodotti_fornitore
  add constraint catalogo_prodotti_fornitore_categoria_utilizzo_check
  check (
    categoria_utilizzo is null
    or categoria_utilizzo in (
      'mat_consumo',
      'mat_poco_consumo',
      'acquisti_occasionali'
    )
  );

comment on column public.catalogo_prodotti_fornitore.categoria_utilizzo is
  'Utilizzo: mat_consumo | mat_poco_consumo | acquisti_occasionali (null = da classificare)';

create index if not exists materie_prime_categoria_utilizzo_idx
  on public.materie_prime (categoria_utilizzo)
  where deleted_at is null;

create index if not exists catalogo_prodotti_fornitore_categoria_utilizzo_idx
  on public.catalogo_prodotti_fornitore (categoria_utilizzo)
  where deleted_at is null;
