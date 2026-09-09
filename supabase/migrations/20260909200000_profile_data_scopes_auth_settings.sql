-- Ambiti dati per profilo (tutte / proprie / da oggi / aziende caricate)
-- e sblocco auditato di Area Fiscale / Ricerca e sviluppo.
-- ISO 9001: audit, soft delete, RLS, nessuna delete fisica.

create table if not exists public.profile_auth_settings (
  profile_id uuid primary key references public.profiles (id) on delete cascade,
  is_commercialista boolean not null default false,
  fiscale_unlocked_at timestamptz,
  fiscale_unlocked_by uuid references auth.users (id) on delete set null,
  rs_unlocked_at timestamptz,
  rs_unlocked_by uuid references auth.users (id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  created_by uuid references auth.users (id) on delete set null,
  updated_by uuid references auth.users (id) on delete set null,
  deleted_at timestamptz,
  deleted_by uuid references auth.users (id) on delete set null
);

drop trigger if exists profile_auth_settings_updated_at on public.profile_auth_settings;
create trigger profile_auth_settings_updated_at
  before update on public.profile_auth_settings
  for each row execute function public.set_updated_at();

comment on table public.profile_auth_settings is
  'ISO: sblocco Area Fiscale / R&S e flag commercialista. Soft delete. Scrittura solo service_role.';

alter table public.profile_auth_settings enable row level security;

drop policy if exists "profile_auth_settings_select_own" on public.profile_auth_settings;
create policy "profile_auth_settings_select_own"
  on public.profile_auth_settings for select to authenticated
  using (profile_id = public.app_effective_uid() and deleted_at is null);

grant select on table public.profile_auth_settings to authenticated;
grant all on table public.profile_auth_settings to postgres, service_role;
revoke insert, update, delete on table public.profile_auth_settings from authenticated;

create table if not exists public.profile_data_scopes (
  id uuid primary key default gen_random_uuid(),
  profile_id uuid not null references public.profiles (id) on delete cascade,
  scope_key text not null,
  mode text not null check (
    mode in ('tutte', 'proprie', 'da_oggi', 'aziende_proprie')
  ),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  created_by uuid references auth.users (id) on delete set null,
  updated_by uuid references auth.users (id) on delete set null,
  deleted_at timestamptz,
  deleted_by uuid references auth.users (id) on delete set null
);

create unique index if not exists profile_data_scopes_profile_key_uidx
  on public.profile_data_scopes (profile_id, scope_key)
  where deleted_at is null;

create index if not exists profile_data_scopes_profile_idx
  on public.profile_data_scopes (profile_id)
  where deleted_at is null;

drop trigger if exists profile_data_scopes_updated_at on public.profile_data_scopes;
create trigger profile_data_scopes_updated_at
  before update on public.profile_data_scopes
  for each row execute function public.set_updated_at();

comment on table public.profile_data_scopes is
  'ISO: ambito dati (tutte / proprie / da oggi / aziende caricate). Soft delete. Scrittura solo service_role.';

alter table public.profile_data_scopes enable row level security;

drop policy if exists "profile_data_scopes_select_own" on public.profile_data_scopes;
create policy "profile_data_scopes_select_own"
  on public.profile_data_scopes for select to authenticated
  using (profile_id = public.app_effective_uid() and deleted_at is null);

grant select on table public.profile_data_scopes to authenticated;
grant all on table public.profile_data_scopes to postgres, service_role;
revoke insert, update, delete on table public.profile_data_scopes from authenticated;
