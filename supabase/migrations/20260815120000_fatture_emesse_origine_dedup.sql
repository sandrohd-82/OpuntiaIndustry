-- Fatture emesse: origine (manuale / sync / emissione) per anti-duplicato sync ISO 9001

alter table public.fatture_emesse
  add column if not exists origine text not null default 'manuale';

alter table public.fatture_emesse
  drop constraint if exists fatture_emesse_origine_check;

alter table public.fatture_emesse
  add constraint fatture_emesse_origine_check
  check (origine in ('manuale', 'sync_fic', 'emissione_gestionale'));

comment on column public.fatture_emesse.origine is
  'manuale = inserita a mano; sync_fic = da coda FiC; emissione_gestionale = creata da Opuntia su FiC';

-- Backfill: con fic_id → sync_fic; senza resta manuale (default)
update public.fatture_emesse
set origine = 'sync_fic'
where fic_id is not null;

create index if not exists fatture_emesse_numero_ext_active_idx
  on public.fatture_emesse (upper(trim(numero_documento_esterno)))
  where deleted_at is null and trim(numero_documento_esterno) <> '';

create index if not exists fatture_emesse_origine_idx
  on public.fatture_emesse (origine)
  where deleted_at is null;
