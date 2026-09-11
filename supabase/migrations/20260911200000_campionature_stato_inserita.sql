-- Lo stato operativo «Inserito» non deve riusare il codice documento ISO «bozza».

alter table public.campionature drop constraint if exists campionature_stato_check;
alter table public.campionature
  add constraint campionature_stato_check check (
    stato in (
      'inserita',
      'bozza',
      'processata',
      'pronto_spedizione',
      'inviata',
      'consegnata',
      'annullata'
    )
  );

insert into public.audit_log (
  entity_type,
  entity_id,
  action,
  summary,
  payload
)
select
  'campionature',
  c.id,
  'status_change',
  format('Stato operativo %s: codice bozza → inserita (etichetta Inserito)', c.numero_interno),
  jsonb_build_object('from', 'bozza', 'to', 'inserita')
from public.campionature c
where c.deleted_at is null
  and c.stato = 'bozza';

update public.campionature
set
  stato = 'inserita',
  updated_at = now()
where deleted_at is null
  and stato = 'bozza';

comment on column public.campionature.stato is
  'Ciclo operativo: inserita=Inserito. documento_stato resta bozza/approvato/chiuso (ISO 7.5).';
