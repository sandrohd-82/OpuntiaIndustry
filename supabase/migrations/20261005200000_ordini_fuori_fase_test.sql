-- Ordini fuori dalla fase di prova.
-- ISO 9001 §8.5.2: i documenti operativi non nascono più come dati di test.
-- Nessuna cancellazione fisica. Le righe già soft-deleted restano is_test.

alter table public.ordini alter column is_test set default false;
alter table public.magazzino_giacenze alter column is_test set default false;
alter table public.magazzino_movimenti alter column is_test set default false;
alter table public.produzione_resa_osservazioni alter column is_test set default false;

comment on column public.ordini.is_test is
  'Storico. I nuovi ordini nascono false. true resta solo sui dati di prova già chiusi.';

with promossi as (
  update public.ordini
  set is_test = false,
      updated_at = now()
  where deleted_at is null
    and is_test = true
  returning id, updated_by
)
insert into public.audit_log (
  entity_type,
  entity_id,
  action,
  actor_id,
  summary,
  payload
)
select
  'ordini',
  id,
  'update',
  updated_by,
  'Ordine uscito dalla fase di prova: documento operativo',
  jsonb_build_object('is_test', false, 'motivo', 'fine_fase_test')
from promossi;

update public.magazzino_giacenze
set is_test = false,
    updated_at = now()
where deleted_at is null
  and is_test = true;

update public.magazzino_movimenti
set is_test = false,
    updated_at = now()
where deleted_at is null
  and is_test = true;

update public.produzione_resa_osservazioni
set is_test = false,
    updated_at = now()
where deleted_at is null
  and is_test = true;
