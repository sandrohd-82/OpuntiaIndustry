-- Processi: elenco (in uso) / storico (deprecati) / eliminato (soft delete).
-- Non è un ciclo Bozza/Approvato: la collocazione è logica.

alter table public.produzione_processi
  add column if not exists deprecato_at timestamptz,
  add column if not exists deprecato_by uuid references auth.users (id) on delete set null,
  add column if not exists deprecato_note text not null default '',
  add column if not exists sostituito_da uuid references public.produzione_processi (id) on delete set null;

comment on column public.produzione_processi.deprecato_at is
  'Se valorizzato il processo è nello storico (deprecato), non in elenco.';
comment on column public.produzione_processi.sostituito_da is
  'Eventuale processo in elenco che sostituisce questa versione.';

create index if not exists produzione_processi_elenco_idx
  on public.produzione_processi (codice)
  where deleted_at is null and deprecato_at is null;

create index if not exists produzione_processi_storico_idx
  on public.produzione_processi (deprecato_at desc)
  where deleted_at is null and deprecato_at is not null;

-- I vecchi "chiuso" diventano deprecati (storico). Bozza/approvato restano in elenco.
update public.produzione_processi
set
  deprecato_at = coalesce(deprecato_at, updated_at, created_at, now()),
  deprecato_note = case
    when coalesce(deprecato_note, '') = '' then 'Migrato da processo chiuso'
    else deprecato_note
  end,
  attivo = false
where deleted_at is null
  and documento_stato = 'chiuso'
  and deprecato_at is null;

-- Compatibilità vincolo documento_stato: in elenco = approvato, storico = chiuso.
update public.produzione_processi
set documento_stato = 'approvato'
where deleted_at is null
  and deprecato_at is null
  and documento_stato = 'bozza';
