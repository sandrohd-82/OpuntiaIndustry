-- Fatture estere caricate dagli strumenti: l'IVA è sempre zero.
-- Lo zero salvato veniva mostrato come 22%. Una sola fattura, Ft-26-F0D3/2,
-- aveva davvero il 22% sulle righe: il totale torna all'imponibile.

with prima as (
  select
    f.id,
    f.numero_interno,
    f.iva_percentuale,
    f.imposta,
    f.totale,
    f.imponibile,
    f.spedizione_iva_percentuale,
    f.updated_by
  from public.fatture_ricevute f
  where f.deleted_at is null
    and f.note ilike '%Fattura estera caricata dagli strumenti%'
    and (
      f.iva_percentuale is distinct from 0
      or f.imposta is distinct from 0
      or f.spedizione_iva_percentuale is distinct from 0
      or f.spedizione_iva_applicata is true
    )
),
aggiornate as (
  update public.fatture_ricevute f
  set
    iva_percentuale = 0,
    imposta = 0,
    totale = case
      when f.imposta is distinct from 0 or f.iva_percentuale is distinct from 0
        then f.imponibile
      else f.totale
    end,
    spedizione_iva_percentuale = 0,
    spedizione_iva_applicata = false,
    versione = f.versione + 1,
    updated_at = now()
  from prima p
  where f.id = p.id
  returning f.id
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
  'fatture_ricevute',
  p.id,
  'update',
  p.updated_by,
  'IVA azzerata sulla fattura estera ' || p.numero_interno,
  jsonb_build_object(
    'iva_prima', p.iva_percentuale,
    'imposta_prima', p.imposta,
    'totale_prima', p.totale,
    'imponibile', p.imponibile,
    'spedizione_iva_prima', p.spedizione_iva_percentuale,
    'totale_dopo', case
      when p.imposta is distinct from 0 or p.iva_percentuale is distinct from 0
        then p.imponibile
      else p.totale
    end
  )
from prima p
where p.id in (select id from aggiornate);

update public.fatture_ricevute_righe r
set
  iva_percentuale = 0,
  updated_at = now(),
  updated_by = f.updated_by
from public.fatture_ricevute f
where r.fattura_id = f.id
  and f.deleted_at is null
  and f.note ilike '%Fattura estera caricata dagli strumenti%'
  and r.iva_percentuale is distinct from 0;
