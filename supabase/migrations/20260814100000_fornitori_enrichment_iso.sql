-- Enrichment anagrafica fornitori (ISO 9001)
-- Fonte lookup + verifica operatore al salvataggio.

alter table public.fornitori
  add column if not exists anagrafica_fonte text,
  add column if not exists verified_by uuid references auth.users (id) on delete set null,
  add column if not exists verified_at timestamptz,
  add column if not exists enrichment_snapshot jsonb;

alter table public.fornitori
  drop constraint if exists fornitori_anagrafica_fonte_check;

alter table public.fornitori
  add constraint fornitori_anagrafica_fonte_check
  check (
    anagrafica_fonte is null
    or anagrafica_fonte in (
      'manuale',
      'locale',
      'archivio',
      'fic_supplier',
      'fic_client',
      'fic_fattura'
    )
  );

comment on column public.fornitori.anagrafica_fonte is
  'Origine dati anagrafici: manuale | archivio | FiC (supplier/client/fattura)';
comment on column public.fornitori.verified_by is
  'Operatore che ha verificato i dati dopo enrichment (ISO 9001)';
comment on column public.fornitori.verified_at is
  'Timestamp verifica anagrafica da parte dell''operatore';
comment on column public.fornitori.enrichment_snapshot is
  'Snapshot immutabile dei dati proposti dal lookup al momento della verifica';
