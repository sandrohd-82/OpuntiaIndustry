-- Foto carico all'arrivo sul foglio ingresso MP (ISO 9001 §7.5 / 8.5.2).
-- Lato destro e sinistro: evidenza registrata, senza delete fisico.

alter table public.produzione_fogli_ingresso_mp
  add column if not exists carico_lato_destro_path text,
  add column if not exists carico_lato_destro_name text,
  add column if not exists carico_lato_sinistro_path text,
  add column if not exists carico_lato_sinistro_name text;

comment on column public.produzione_fogli_ingresso_mp.carico_lato_destro_path is
  'Storage path foto lato destro del carico all''arrivo del mezzo.';
comment on column public.produzione_fogli_ingresso_mp.carico_lato_sinistro_path is
  'Storage path foto lato sinistro del carico all''arrivo del mezzo.';
