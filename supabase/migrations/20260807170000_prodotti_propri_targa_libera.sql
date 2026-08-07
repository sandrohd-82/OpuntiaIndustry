-- Prodotti propri: targa completamente libera (niente prefisso Pp fisso)

alter table public.prodotti_propri
  drop constraint if exists prodotti_propri_codice_pp;

alter table public.prodotti_propri
  add constraint prodotti_propri_codice_alfanum
  check (codice ~ '^[A-Za-z0-9\-_\/]+$');

comment on column public.prodotti_propri.codice is
  'Targa/codice interno completamente modificabile (lettere, cifre, - _ /)';
