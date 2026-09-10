-- Unità badge: °C, Kg, Bar.

update public.action_essiccatore_sensori
set unita = 'Bar', updated_at = now()
where codice = 'PRESS-SOFF' and unita is distinct from 'Bar';

update public.action_essiccatore_sensori
set unita = 'Kg', updated_at = now()
where codice = 'PESO' and unita is distinct from 'Kg';

update public.action_essiccatore_sensori
set unita = '°C', updated_at = now()
where codice in ('TEMP-AMB', 'TEMP-BRUC') and unita is distinct from '°C';
