-- Catalogo fisso: 4 sensori per ogni essiccatore installato.

insert into public.action_essiccatore_sensori (
  essiccatore_id, codice, nome, unita, x_pct, y_pct
)
select v.essiccatore_id, v.codice, v.nome, v.unita, v.x_pct, v.y_pct
from (
  values
    ('ess-a', 'TEMP-AMB', 'Temperatura Ambientale', '°C', 18, 22),
    ('ess-a', 'TEMP-BRUC', 'Temperatura Uscita Bruciatore', '°C', 82, 22),
    ('ess-a', 'PRESS-SOFF', 'Sensore di pressione Piano Soffiante', 'mbar', 18, 78),
    ('ess-a', 'PESO', 'Peso prodotto', 'kg', 82, 78),
    ('ess-b', 'TEMP-AMB', 'Temperatura Ambientale', '°C', 18, 22),
    ('ess-b', 'TEMP-BRUC', 'Temperatura Uscita Bruciatore', '°C', 82, 22),
    ('ess-b', 'PRESS-SOFF', 'Sensore di pressione Piano Soffiante', 'mbar', 18, 78),
    ('ess-b', 'PESO', 'Peso prodotto', 'kg', 82, 78),
    ('ess-ultimo-stadio', 'TEMP-AMB', 'Temperatura Ambientale', '°C', 18, 22),
    ('ess-ultimo-stadio', 'TEMP-BRUC', 'Temperatura Uscita Bruciatore', '°C', 82, 22),
    ('ess-ultimo-stadio', 'PRESS-SOFF', 'Sensore di pressione Piano Soffiante', 'mbar', 18, 78),
    ('ess-ultimo-stadio', 'PESO', 'Peso prodotto', 'kg', 82, 78)
) as v(essiccatore_id, codice, nome, unita, x_pct, y_pct)
where not exists (
  select 1
  from public.action_essiccatore_sensori s
  where s.essiccatore_id = v.essiccatore_id
    and s.codice = v.codice
);

-- Eventuali bandiere create a mano (SEN-xxx) escono dall'elenco operativo.
update public.action_essiccatore_sensori
set
  deleted_at = coalesce(deleted_at, now()),
  updated_at = now()
where deleted_at is null
  and codice not in ('TEMP-AMB', 'TEMP-BRUC', 'PRESS-SOFF', 'PESO');
