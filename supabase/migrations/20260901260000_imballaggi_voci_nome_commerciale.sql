-- Nome commerciale per documenti ed export (ISO 9001 7.5).
-- Etichetta UI per stadio: Tipo di Movimentazione / Confezione / Isolamento.

alter table public.imballaggi_voci
  add column if not exists nome_commerciale text not null default '';

comment on column public.imballaggi_voci.nome_commerciale is
  'Nome commerciale per documentazione esterna ed export. L’etichetta in maschera dipende dallo stadio.';
