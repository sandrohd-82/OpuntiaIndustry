-- Note di credito emesse (FiC type=credit_note) — ISO 9001
-- Stesso storico fatture_emesse con discriminante tipo_documento + collegamento fattura

alter table public.fatture_emesse
  add column if not exists tipo_documento text not null default 'fattura',
  add column if not exists fattura_collegata_id uuid references public.fatture_emesse (id) on delete set null,
  add column if not exists riferimento_fattura_esterno text not null default '';

alter table public.fatture_emesse drop constraint if exists fatture_emesse_tipo_documento_check;
alter table public.fatture_emesse
  add constraint fatture_emesse_tipo_documento_check
  check (tipo_documento in ('fattura', 'nota_credito'));

comment on column public.fatture_emesse.tipo_documento is
  'fattura | nota_credito (documenti FiC invoice / credit_note)';
comment on column public.fatture_emesse.fattura_collegata_id is
  'Fattura emessa a cui la nota di credito si riferisce (se individuata)';
comment on column public.fatture_emesse.riferimento_fattura_esterno is
  'Riferimento testuale alla fattura annullata/stornata (es. 20/2025)';

create index if not exists fatture_emesse_tipo_documento_idx
  on public.fatture_emesse (tipo_documento, data_emissione desc)
  where deleted_at is null;

create index if not exists fatture_emesse_fattura_collegata_idx
  on public.fatture_emesse (fattura_collegata_id)
  where deleted_at is null and fattura_collegata_id is not null;

-- Numero interno note credito: Nc-AA-TARGA/N (coesiste con Ft-…)
comment on column public.fatture_emesse.numero_interno is
  'Ft-AA-TARGA/N per fatture; Nc-AA-TARGA/N per note di credito';
