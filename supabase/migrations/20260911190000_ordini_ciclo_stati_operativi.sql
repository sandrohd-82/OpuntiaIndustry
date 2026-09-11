-- ISO 9001 §8.5: ciclo operativo ordine
-- Inserito (creato) → Processato (scaletta) → Pronto per spedizione (attesa ritiro) → Inviato (ritirato in viaggio)

alter table public.ordini drop constraint if exists ordini_stato_check;
alter table public.ordini
  add constraint ordini_stato_check check (
    stato in (
      'in_attesa',
      'sospeso',
      'in_scaletta',
      'pronto_spedizione',
      'inviato',
      'storico',
      'ricevuto',
      'evaso'
    )
  );

comment on column public.ordini.stato is
  'Ciclo: in_attesa/ricevuto=Inserito, in_scaletta=Processato, pronto_spedizione=Pronto per spedizione, inviato/evaso=Inviato.';

alter table public.campionature drop constraint if exists campionature_stato_check;
alter table public.campionature
  add constraint campionature_stato_check check (
    stato in (
      'bozza',
      'processata',
      'pronto_spedizione',
      'inviata',
      'consegnata',
      'annullata'
    )
  );

comment on column public.campionature.stato is
  'Ciclo: bozza=Inserito, processata=Processato, pronto_spedizione=Pronto per spedizione, inviata=Inviato.';

-- Gli invii creati dal form erano salvati già come «inviata».
-- Non erano ritirati: tornano Inserito (bozza). sent_at resta traccia dell’inserimento.
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
  format(
    'Stato operativo %s: Inviata → Inserito (ordine creato)',
    c.numero_interno
  ),
  jsonb_build_object(
    'from',
    'inviata',
    'to',
    'bozza',
    'motivo',
    'ciclo_operativo_inserito_processato_pronto_inviato'
  )
from public.campionature c
where c.deleted_at is null
  and c.stato = 'inviata';

update public.campionature
set
  stato = 'bozza',
  sent_at = null,
  sent_by = null,
  updated_at = now()
where deleted_at is null
  and stato = 'inviata';
