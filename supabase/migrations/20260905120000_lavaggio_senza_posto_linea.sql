-- Lavaggio: la vasca è un impianto, non una postazione (serve un operatore).
-- Soft delete del seed «linea-principale». ISO 9001 8.5.2: niente delete fisico.

update public.produzione_posti_lavoro p
set
  deleted_at = now(),
  updated_at = now()
from public.produzione_aree a
where p.area_id = a.id
  and a.deleted_at is null
  and lower(a.codice) = 'lavaggio'
  and lower(p.codice) = 'linea-principale'
  and p.deleted_at is null;
