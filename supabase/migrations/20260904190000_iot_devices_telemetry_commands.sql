-- Modulo IoT/telemetria senza broker MQTT (REST + Supabase Realtime).
-- Collegato ai macchinari di produzione (ISO 9001 8.5.2 / 7.5 / 6.1).

create table if not exists public.iot_devices (
  id uuid primary key default gen_random_uuid(),
  macchinario_id uuid not null references public.produzione_macchinari (id),
  device_code text not null,
  name text not null,
  status text not null default 'OFFLINE'
    check (status in ('ONLINE', 'OFFLINE')),
  last_ping timestamptz,
  api_token_hash text,
  api_token_hint text not null default '',
  poll_seconds integer not null default 5
    check (poll_seconds between 1 and 300),
  documento_stato text not null default 'approvato'
    check (documento_stato in ('bozza', 'approvato')),
  versione integer not null default 1,
  created_by uuid references auth.users (id) on delete set null,
  updated_by uuid references auth.users (id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz,
  deleted_by uuid references auth.users (id) on delete set null
);

create unique index if not exists iot_devices_macchinario_uidx
  on public.iot_devices (macchinario_id)
  where deleted_at is null;

create unique index if not exists iot_devices_code_uidx
  on public.iot_devices (lower(device_code))
  where deleted_at is null;

comment on table public.iot_devices is
  'Dispositivi IoT collegati a un macchinario. Token solo in hash; accesso via API gestionale.';

drop trigger if exists iot_devices_updated_at on public.iot_devices;
create trigger iot_devices_updated_at
  before update on public.iot_devices
  for each row execute function public.set_updated_at();

alter table public.iot_devices enable row level security;

drop policy if exists iot_devices_select on public.iot_devices;
create policy iot_devices_select
  on public.iot_devices for select to authenticated
  using (
    public.has_area_access('produzione')
    or public.has_area_access('amministrazione')
    or public.is_superadmin()
  );

drop policy if exists iot_devices_write on public.iot_devices;
create policy iot_devices_write
  on public.iot_devices for insert to authenticated
  with check (public.is_admin() or public.is_superadmin());

drop policy if exists iot_devices_update on public.iot_devices;
create policy iot_devices_update
  on public.iot_devices for update to authenticated
  using (public.is_admin() or public.is_superadmin())
  with check (public.is_admin() or public.is_superadmin());

grant select on table public.iot_devices to authenticated;
grant insert, update on table public.iot_devices to authenticated;
grant all on table public.iot_devices to postgres, service_role;
revoke delete on table public.iot_devices from authenticated;

create table if not exists public.iot_telemetry (
  id uuid primary key default gen_random_uuid(),
  device_id uuid not null references public.iot_devices (id),
  data jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create index if not exists iot_telemetry_device_created_idx
  on public.iot_telemetry (device_id, created_at desc);

comment on table public.iot_telemetry is
  'Telemetria insert-only dai microcontrollori (JSON: temperatura, pressione, on, …).';

alter table public.iot_telemetry enable row level security;

drop policy if exists iot_telemetry_select on public.iot_telemetry;
create policy iot_telemetry_select
  on public.iot_telemetry for select to authenticated
  using (
    public.has_area_access('produzione')
    or public.has_area_access('amministrazione')
    or public.is_superadmin()
  );

grant select on table public.iot_telemetry to authenticated;
grant all on table public.iot_telemetry to postgres, service_role;
revoke insert, update, delete on table public.iot_telemetry from authenticated;

create table if not exists public.iot_commands (
  id uuid primary key default gen_random_uuid(),
  device_id uuid not null references public.iot_devices (id),
  command text not null,
  executed boolean not null default false,
  executed_at timestamptz,
  created_by uuid references auth.users (id) on delete set null,
  updated_by uuid references auth.users (id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists iot_commands_device_pending_idx
  on public.iot_commands (device_id, created_at)
  where executed = false;

comment on table public.iot_commands is
  'Comandi verso il dispositivo (POWER_ON, POWER_OFF, …). Il firmware fa polling e ack.';

drop trigger if exists iot_commands_updated_at on public.iot_commands;
create trigger iot_commands_updated_at
  before update on public.iot_commands
  for each row execute function public.set_updated_at();

alter table public.iot_commands enable row level security;

drop policy if exists iot_commands_select on public.iot_commands;
create policy iot_commands_select
  on public.iot_commands for select to authenticated
  using (
    public.has_area_access('produzione')
    or public.has_area_access('amministrazione')
    or public.is_superadmin()
  );

drop policy if exists iot_commands_insert on public.iot_commands;
create policy iot_commands_insert
  on public.iot_commands for insert to authenticated
  with check (
    public.has_area_access('produzione')
    or public.has_area_access('amministrazione')
    or public.is_superadmin()
  );

drop policy if exists iot_commands_update on public.iot_commands;
create policy iot_commands_update
  on public.iot_commands for update to authenticated
  using (
    public.has_area_access('produzione')
    or public.has_area_access('amministrazione')
    or public.is_superadmin()
  )
  with check (
    public.has_area_access('produzione')
    or public.has_area_access('amministrazione')
    or public.is_superadmin()
  );

grant select, insert, update on table public.iot_commands to authenticated;
grant all on table public.iot_commands to postgres, service_role;
revoke delete on table public.iot_commands from authenticated;

alter table public.iot_telemetry replica identity full;
alter table public.iot_commands replica identity full;
alter table public.iot_devices replica identity full;

do $$
begin
  begin
    alter publication supabase_realtime add table public.iot_telemetry;
  exception when duplicate_object then null;
  end;
  begin
    alter publication supabase_realtime add table public.iot_commands;
  exception when duplicate_object then null;
  end;
  begin
    alter publication supabase_realtime add table public.iot_devices;
  exception when duplicate_object then null;
  end;
end $$;
