-- Fase Test profili (procedura standard Super Admin) + visibilità pagine + primo accesso
-- ISO 9001: audit, soft delete, login solo se operativo, nessuna mail in test.

-- ---------------------------------------------------------------------------
-- Stato: aggiunge 'test' (LED grigio). Default nuovi profili = test.
-- I profili già esistenti restano operativo.
-- ---------------------------------------------------------------------------
alter table public.profiles
  drop constraint if exists profiles_stato_operativo_check;

alter table public.profiles
  add constraint profiles_stato_operativo_check
  check (stato_operativo in ('operativo', 'sospeso', 'bloccato', 'test'));

alter table public.profiles
  alter column stato_operativo set default 'test';

comment on column public.profiles.stato_operativo is
  'LED: test (grigio, solo switch SA), operativo (verde), sospeso (giallo), bloccato (rosso). Login solo se operativo.';

alter table public.profiles
  add column if not exists primo_accesso_token_hash text,
  add column if not exists primo_accesso_expires_at timestamptz,
  add column if not exists password_impostata_at timestamptz,
  add column if not exists welcome_visto_at timestamptz,
  add column if not exists attivato_at timestamptz,
  add column if not exists attivato_by uuid references auth.users (id) on delete set null;

comment on column public.profiles.primo_accesso_token_hash is
  'Hash SHA-256 del token di primo accesso (password). Mai il token in chiaro.';
comment on column public.profiles.password_impostata_at is
  'Quando l''operatore ha impostato la password dal link di attivazione.';
comment on column public.profiles.welcome_visto_at is
  'Primo accesso: messaggio di benvenuto già mostrato.';

-- ---------------------------------------------------------------------------
-- Visibilità pagine per profilo (On / Off). Assenza riga = non impostato (grigio).
-- ---------------------------------------------------------------------------
create table if not exists public.profile_page_access (
  id uuid primary key default gen_random_uuid(),
  profile_id uuid not null references public.profiles (id) on delete cascade,
  page_key text not null,
  visibile boolean not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  created_by uuid references auth.users (id) on delete set null,
  updated_by uuid references auth.users (id) on delete set null,
  deleted_at timestamptz,
  deleted_by uuid references auth.users (id) on delete set null
);

create unique index if not exists profile_page_access_profile_key_uidx
  on public.profile_page_access (profile_id, page_key)
  where deleted_at is null;

create index if not exists profile_page_access_profile_idx
  on public.profile_page_access (profile_id)
  where deleted_at is null;

drop trigger if exists profile_page_access_updated_at on public.profile_page_access;
create trigger profile_page_access_updated_at
  before update on public.profile_page_access
  for each row execute function public.set_updated_at();

comment on table public.profile_page_access is
  'ISO: On/Off pagine in fase test. Soft delete. Operativo: visibili solo le pagine On.';

alter table public.profile_page_access enable row level security;

drop policy if exists "profile_page_access_select_own" on public.profile_page_access;
create policy "profile_page_access_select_own"
  on public.profile_page_access for select to authenticated
  using (profile_id = public.app_effective_uid() and deleted_at is null);

grant select on table public.profile_page_access to authenticated;
grant all on table public.profile_page_access to postgres, service_role;
revoke insert, update, delete on table public.profile_page_access from authenticated;

-- Nuovi signup: stato test esplicito (oltre al default colonna)
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  default_role_id uuid;
begin
  select id into default_role_id from public.app_roles where code = 'operator' limit 1;

  insert into public.profiles (id, email, full_name, role_id, stato_operativo)
  values (
    new.id,
    new.email,
    coalesce(new.raw_user_meta_data->>'full_name', split_part(new.email, '@', 1)),
    default_role_id,
    'test'
  );

  insert into public.user_second_factor (user_id, method)
  values (new.id, 'email');

  return new;
end;
$$;
