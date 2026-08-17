-- Applica CF e ripulisce targhe residue (idempotente rispetto a 141200).
-- Eseguire su remoto se 20260814120000 non era ancora stata applicata.

alter table public.fornitori
  add column if not exists codice_fiscale text not null default '';

update public.fornitori
set codice_fiscale = trim(partita_iva)
where trim(coalesce(codice_fiscale, '')) = ''
  and trim(coalesce(partita_iva, '')) <> '';

update public.fornitori f
set codice_fiscale = trim(coalesce(f.enrichment_snapshot->>'codiceFiscale', ''))
where trim(coalesce(f.codice_fiscale, '')) = ''
  and trim(coalesce(f.enrichment_snapshot->>'codiceFiscale', '')) <> '';

create index if not exists fornitori_codice_fiscale_active_idx
  on public.fornitori (upper(trim(codice_fiscale)))
  where deleted_at is null and trim(codice_fiscale) <> '';

-- Hard delete vuoti / soft-delete senza bio (senza traccia in archivio)
with targets as (
  select f.id
  from public.fornitori f
  where
    (
      f.deleted_at is not null
      and not exists (
        select 1 from public.materie_prime m
        where m.fornitore_bio_id = f.id and m.deleted_at is null
      )
    )
    or (
      f.deleted_at is null
      and trim(coalesce(f.ragione_sociale, '')) = ''
      and trim(coalesce(f.partita_iva, '')) = ''
    )
)
update public.materie_prime m
set fornitore_bio_id = null
where m.fornitore_bio_id in (select id from targets);

with targets as (
  select f.id
  from public.fornitori f
  where
    (
      f.deleted_at is not null
      and not exists (
        select 1 from public.materie_prime m
        where m.fornitore_bio_id = f.id and m.deleted_at is null
      )
    )
    or (
      f.deleted_at is null
      and trim(coalesce(f.ragione_sociale, '')) = ''
      and trim(coalesce(f.partita_iva, '')) = ''
    )
)
delete from public.fornitori f
where f.id in (select id from targets);
