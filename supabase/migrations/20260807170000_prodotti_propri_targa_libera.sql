-- Prodotti propri: targa completamente libera (niente prefisso Pp fisso)
-- Idempotente.

alter table public.prodotti_propri
  drop constraint if exists prodotti_propri_codice_pp;

do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conname = 'prodotti_propri_codice_alfanum'
  ) then
    alter table public.prodotti_propri
      add constraint prodotti_propri_codice_alfanum
      check (codice ~ '^[A-Za-z0-9\-_\/]+$');
  end if;
end $$;

comment on column public.prodotti_propri.codice is
  'Targa/codice interno completamente modificabile (lettere, cifre, - _ /)';
