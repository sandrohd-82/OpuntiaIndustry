-- Impostazioni broker Mosquitto per il gestionale e per i device.
-- Le password restano cifrate. Nessuna cancellazione fisica.

create table if not exists public.iot_broker_impostazioni (
  id uuid primary key,
  versione integer not null default 1 check (versione > 0),
  stato text not null default 'approvato'
    check (stato in ('bozza', 'approvato', 'chiuso')),
  web_host text not null,
  web_porta integer not null check (web_porta between 1 and 65535),
  web_protocollo text not null check (web_protocollo in ('ws', 'wss')),
  web_utente text not null default '',
  web_password_cifrata text not null default '',
  web_client_id_prefix text not null default 'opuntia-web-ui',
  device_host text not null,
  device_porta integer not null check (device_porta between 1 and 65535),
  device_protocollo text not null check (device_protocollo in ('mqtt', 'mqtts')),
  device_utente text not null default '',
  device_password_cifrata text not null default '',
  topic_comando text not null,
  topic_stato text not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  created_by uuid,
  updated_by uuid,
  deleted_at timestamptz,
  deleted_by uuid
);

comment on table public.iot_broker_impostazioni is
  'Configurazione persistente del broker MQTT: WebSocket del gestionale e MQTT dei device.';

drop trigger if exists iot_broker_impostazioni_updated_at on public.iot_broker_impostazioni;
create trigger iot_broker_impostazioni_updated_at
  before update on public.iot_broker_impostazioni
  for each row execute function public.set_updated_at();

alter table public.iot_broker_impostazioni enable row level security;

drop policy if exists iot_broker_impostazioni_select on public.iot_broker_impostazioni;
drop policy if exists iot_broker_impostazioni_insert on public.iot_broker_impostazioni;
drop policy if exists iot_broker_impostazioni_update on public.iot_broker_impostazioni;

create policy iot_broker_impostazioni_select
  on public.iot_broker_impostazioni for select to authenticated
  using (
    public.has_area_access('strumenti')
    or public.is_superadmin()
  );

create policy iot_broker_impostazioni_insert
  on public.iot_broker_impostazioni for insert to authenticated
  with check (
    public.has_area_access('strumenti')
    or public.is_superadmin()
  );

create policy iot_broker_impostazioni_update
  on public.iot_broker_impostazioni for update to authenticated
  using (
    public.has_area_access('strumenti')
    or public.is_superadmin()
  )
  with check (
    public.has_area_access('strumenti')
    or public.is_superadmin()
  );

grant select, insert, update on public.iot_broker_impostazioni to authenticated;
grant all on public.iot_broker_impostazioni to postgres, service_role;
revoke delete on public.iot_broker_impostazioni from authenticated;

insert into public.iot_broker_impostazioni (
  id,
  versione,
  stato,
  web_host,
  web_porta,
  web_protocollo,
  web_utente,
  web_client_id_prefix,
  device_host,
  device_porta,
  device_protocollo,
  device_utente,
  topic_comando,
  topic_stato
) values (
  'b11a0001-0000-4000-8000-000000000001',
  1,
  'approvato',
  '69.197.187.172',
  9001,
  'ws',
  'utente_opuntia',
  'opuntia-web-ui',
  '69.197.187.172',
  443,
  'mqtt',
  'utente_opuntia',
  'opuntia/device/{device_id}/set',
  'opuntia/device/{device_id}/status'
)
on conflict (id) do nothing;
