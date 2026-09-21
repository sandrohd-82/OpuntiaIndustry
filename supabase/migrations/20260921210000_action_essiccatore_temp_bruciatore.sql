-- Avvio essiccatore: il bruciatore è un setpoint temperatura (35–70 °C),
-- non una percentuale. La % bruciatore la regolerà il sistema dalla sonda TEMP-BRUC.
-- Soft delete invariato; audit sulle nuove azioni.

alter table public.action_essiccatore_azioni
  drop constraint if exists action_essiccatore_azioni_perc_check;

alter table public.action_essiccatore_azioni
  rename column perc_bruciatore to temp_bruciatore_c;

-- Valori di test già in % 0–100: mappa in 35–70. Se già in range, lascia.
update public.action_essiccatore_azioni
set temp_bruciatore_c = least(
  70,
  greatest(
    35,
    case
      when temp_bruciatore_c between 35 and 70 then temp_bruciatore_c
      else 35 + round(temp_bruciatore_c * 35.0 / 100)
    end
  )
)
where deleted_at is null;

alter table public.action_essiccatore_azioni
  add constraint action_essiccatore_azioni_setpoint_check check (
    temp_bruciatore_c between 35 and 70
    and perc_ventilazione between 0 and 100
  );

comment on column public.action_essiccatore_azioni.temp_bruciatore_c is
  'Setpoint temperatura uscita bruciatore (°C). Il firmware regola la % bruciatore dalla sonda TEMP-BRUC.';

alter table public.action_essiccatore_iot_messaggi
  drop constraint if exists action_essiccatore_iot_canale_check;

update public.action_essiccatore_iot_messaggi
set
  canale = 'temp_bruciatore',
  comando = 'BURNER_TEMP:' || (
    least(
      70,
      greatest(
        35,
        case
          when coalesce((payload->>'percent')::int, 50) between 35 and 70
            then coalesce((payload->>'percent')::int, 50)
          else 35 + round(coalesce((payload->>'percent')::numeric, 50) * 35.0 / 100)
        end
      )
    )::int
  ),
  payload = jsonb_build_object(
    'celsius',
    least(
      70,
      greatest(
        35,
        case
          when coalesce((payload->>'percent')::int, 50) between 35 and 70
            then coalesce((payload->>'percent')::int, 50)
          else 35 + round(coalesce((payload->>'percent')::numeric, 50) * 35.0 / 100)
        end
      )
    )::int,
    'sonda',
    'TEMP-BRUC',
    'regolazione',
    'mantieni_setpoint'
  )
where canale = 'perc_bruciatore'
  and deleted_at is null;

alter table public.action_essiccatore_iot_messaggi
  add constraint action_essiccatore_iot_canale_check check (
    canale in (
      'consenso_bruciatore',
      'temp_bruciatore',
      'consenso_ventola',
      'perc_ventilazione'
    )
  );
