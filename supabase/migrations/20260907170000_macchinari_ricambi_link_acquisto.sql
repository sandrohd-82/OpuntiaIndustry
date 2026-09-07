-- Link di acquisto opzionale su macchinario (se acquistato) e ricambi.

alter table public.produzione_macchinari
  add column if not exists acquistato boolean not null default false,
  add column if not exists link_acquisto text not null default '';

alter table public.produzione_macchinario_ricambi
  add column if not exists link_acquisto text not null default '';

comment on column public.produzione_macchinari.acquistato is
  'True se il macchinario è stato acquistato (non costruito internamente).';
comment on column public.produzione_macchinari.link_acquisto is
  'URL opzionale della pagina/ordine di acquisto del macchinario.';
comment on column public.produzione_macchinario_ricambi.link_acquisto is
  'URL opzionale della pagina/ordine di acquisto del ricambio.';
