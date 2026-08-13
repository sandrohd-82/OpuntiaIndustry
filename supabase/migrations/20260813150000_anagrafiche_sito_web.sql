-- Sito web su schede anagrafiche (clienti / fornitori).
-- Default '' per le aziende già salvate; compilabile in seguito.

alter table public.fornitori
  add column if not exists sito_web text not null default '';

alter table public.clienti
  add column if not exists sito_web text not null default '';

comment on column public.fornitori.sito_web is 'URL sito web aziendale (facoltativo)';
comment on column public.clienti.sito_web is 'URL sito web aziendale (facoltativo)';
