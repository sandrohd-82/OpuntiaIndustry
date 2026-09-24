-- Ripristino regolatore bruciatore: temperatura °C, non inverter % ventola.
-- ESS-A era stato salvato come inverter 0–100%; B/U avevano unità corrotta.

SET lock_timeout = '8s';
SET deadlock_timeout = '2s';

UPDATE public.action_iot_componenti
SET
  tipo_attuatore = 'setpoint_temperatura',
  unita = '°C',
  valore_min = 35,
  valore_max = 70,
  valore_default = CASE
    WHEN valore_default BETWEEN 35 AND 70 THEN valore_default
    ELSE 50
  END,
  versione = versione + 1,
  updated_at = now()
WHERE deleted_at IS NULL
  AND codice IN ('BRU-TEMP-ESS-A', 'BRU-TEMP-ESS-B', 'BRU-TEMP-ESS-U')
  AND (
    tipo_attuatore IS DISTINCT FROM 'setpoint_temperatura'
    OR unita IS DISTINCT FROM '°C'
    OR valore_min IS DISTINCT FROM 35
    OR valore_max IS DISTINCT FROM 70
  );
