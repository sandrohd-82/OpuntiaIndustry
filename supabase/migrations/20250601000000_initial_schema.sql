-- Industry Gestionale — schema iniziale
-- Ruoli, aree, profili utente e secondo fattore (email ora, app in futuro)

-- Estensioni
create extension if not exists "pgcrypto";

-- ---------------------------------------------------------------------------
-- Ruoli applicativi (distinti da auth.roles di Supabase)
-- ---------------------------------------------------------------------------
create table public.app_roles (
  id uuid primary key default gen_random_uuid(),
  code text not null unique,
  name text not null,
  description text,
  created_at timestamptz not null default now()
);

comment on table public.app_roles is 'Ruoli gestionali: admin, direttore, operatore, ecc.';

-- ---------------------------------------------------------------------------
-- Aree del gestionale
-- ---------------------------------------------------------------------------
create table public.areas (
  id uuid primary key default gen_random_uuid(),
  slug text not null unique,
  name text not null,
  description text,
  icon text,
  sort_order int not null default 0,
  is_active boolean not null default true,
  created_at timestamptz not null default now()
);

comment on table public.areas is 'Moduli/aree del gestionale (commerciale, produzione, HR, …)';

-- ---------------------------------------------------------------------------
-- Permessi ruolo → area
-- ---------------------------------------------------------------------------
create table public.role_area_permissions (
  role_id uuid not null references public.app_roles (id) on delete cascade,
  area_id uuid not null references public.areas (id) on delete cascade,
  can_access boolean not null default true,
  primary key (role_id, area_id)
);

-- ---------------------------------------------------------------------------
-- Profilo utente (collegato a auth.users)
-- ---------------------------------------------------------------------------
create table public.profiles (
  id uuid primary key references auth.users (id) on delete cascade,
  email text not null,
  full_name text,
  role_id uuid not null references public.app_roles (id),
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index profiles_role_id_idx on public.profiles (role_id);

-- ---------------------------------------------------------------------------
-- Secondo fattore di autenticazione
-- Fase 1: email | Fase 2 (futuro): app (TOTP)
-- ---------------------------------------------------------------------------
create type public.second_factor_method as enum ('email', 'app');

create table public.user_second_factor (
  user_id uuid primary key references auth.users (id) on delete cascade,
  method public.second_factor_method not null default 'email',
  -- Per email: ultimo codice OTP (hash) e scadenza
  otp_hash text,
  otp_expires_at timestamptz,
  otp_attempts int not null default 0,
  -- Per app (futuro): secret TOTP cifrato
  totp_secret_encrypted text,
  verified_at timestamptz,
  updated_at timestamptz not null default now()
);

comment on table public.user_second_factor is 'Stato del 2° fattore; metodo attivo per utente';

-- Sessione “completa” solo dopo 2FA riuscito (flag lato app + verifica server)
create table public.auth_sessions_2fa (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  session_token_hash text not null unique,
  verified_at timestamptz not null default now(),
  expires_at timestamptz not null,
  created_at timestamptz not null default now()
);

create index auth_sessions_2fa_user_id_idx on public.auth_sessions_2fa (user_id);
create index auth_sessions_2fa_expires_at_idx on public.auth_sessions_2fa (expires_at);

-- ---------------------------------------------------------------------------
-- Trigger updated_at
-- ---------------------------------------------------------------------------
create or replace function public.set_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

create trigger profiles_updated_at
  before update on public.profiles
  for each row execute function public.set_updated_at();

create trigger user_second_factor_updated_at
  before update on public.user_second_factor
  for each row execute function public.set_updated_at();

-- ---------------------------------------------------------------------------
-- Vista: aree visibili per utente corrente
-- ---------------------------------------------------------------------------
create or replace function public.get_user_areas(p_user_id uuid)
returns table (
  area_id uuid,
  slug text,
  name text,
  description text,
  icon text,
  sort_order int
)
language sql
stable
security definer
set search_path = public
as $$
  select
    a.id,
    a.slug,
    a.name,
    a.description,
    a.icon,
    a.sort_order
  from public.profiles p
  join public.role_area_permissions rap on rap.role_id = p.role_id and rap.can_access = true
  join public.areas a on a.id = rap.area_id and a.is_active = true
  where p.id = p_user_id and p.is_active = true
  order by a.sort_order, a.name;
$$;

-- ---------------------------------------------------------------------------
-- Seed: ruoli, aree, permessi di default
-- ---------------------------------------------------------------------------
insert into public.app_roles (code, name, description) values
  ('admin', 'Amministratore', 'Accesso completo a tutte le aree'),
  ('manager', 'Responsabile', 'Accesso alle aree operative assegnate'),
  ('operator', 'Operatore', 'Accesso limitato alle aree operative'),
  ('viewer', 'Consultazione', 'Sola lettura sulle aree consentite');

insert into public.areas (slug, name, description, icon, sort_order) values
  ('dashboard', 'Dashboard', 'Panoramica e indicatori', 'layout-dashboard', 0),
  ('commerciale', 'Commerciale', 'Clienti, ordini e offerte', 'briefcase', 10),
  ('produzione', 'Produzione', 'Pianificazione e avanzamento lavori', 'factory', 20),
  ('magazzino', 'Magazzino', 'Giacenze e movimenti', 'warehouse', 30),
  ('acquisti', 'Acquisti', 'Fornitori e ordini di acquisto', 'shopping-cart', 40),
  ('hr', 'Risorse umane', 'Personale e presenze', 'users', 50),
  ('amministrazione', 'Amministrazione', 'Fatturazione e contabilità', 'calculator', 60),
  ('impostazioni', 'Impostazioni', 'Configurazione sistema (solo admin)', 'settings', 99);

-- Admin: tutte le aree
insert into public.role_area_permissions (role_id, area_id, can_access)
select r.id, a.id, true
from public.app_roles r
cross join public.areas a
where r.code = 'admin';

-- Manager: tutte tranne impostazioni
insert into public.role_area_permissions (role_id, area_id, can_access)
select r.id, a.id, true
from public.app_roles r
cross join public.areas a
where r.code = 'manager' and a.slug <> 'impostazioni';

-- Operator: dashboard + operatività
insert into public.role_area_permissions (role_id, area_id, can_access)
select r.id, a.id, true
from public.app_roles r
cross join public.areas a
where r.code = 'operator'
  and a.slug in ('dashboard', 'commerciale', 'produzione', 'magazzino');

-- Viewer: dashboard + commerciale (sola consultazione — permessi CRUD in fase 2)
insert into public.role_area_permissions (role_id, area_id, can_access)
select r.id, a.id, true
from public.app_roles r
cross join public.areas a
where r.code = 'viewer'
  and a.slug in ('dashboard', 'commerciale');

-- ---------------------------------------------------------------------------
-- RLS
-- ---------------------------------------------------------------------------
alter table public.app_roles enable row level security;
alter table public.areas enable row level security;
alter table public.role_area_permissions enable row level security;
alter table public.profiles enable row level security;
alter table public.user_second_factor enable row level security;
alter table public.auth_sessions_2fa enable row level security;

-- Ruoli e aree: lettura per utenti autenticati
create policy "app_roles_read_authenticated"
  on public.app_roles for select
  to authenticated
  using (true);

create policy "areas_read_authenticated"
  on public.areas for select
  to authenticated
  using (is_active = true);

create policy "role_area_permissions_read_authenticated"
  on public.role_area_permissions for select
  to authenticated
  using (true);

-- Profilo: ogni utente legge/aggiorna solo il proprio (campi limitati)
create policy "profiles_select_own"
  on public.profiles for select
  to authenticated
  using (auth.uid() = id);

create policy "profiles_update_own_name"
  on public.profiles for update
  to authenticated
  using (auth.uid() = id)
  with check (auth.uid() = id);

-- Admin può leggere tutti i profili (policy aggiuntiva via funzione)
create or replace function public.is_admin()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.profiles p
    join public.app_roles r on r.id = p.role_id
    where p.id = auth.uid() and r.code = 'admin'
  );
$$;

create policy "profiles_select_admin"
  on public.profiles for select
  to authenticated
  using (public.is_admin());

-- Secondo fattore: solo il proprio record
create policy "user_second_factor_own"
  on public.user_second_factor for all
  to authenticated
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

-- Sessioni 2FA: solo proprie
create policy "auth_sessions_2fa_own"
  on public.auth_sessions_2fa for select
  to authenticated
  using (auth.uid() = user_id);

-- ---------------------------------------------------------------------------
-- Creazione profilo al signup (da collegare a trigger auth)
-- ---------------------------------------------------------------------------
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

  insert into public.profiles (id, email, full_name, role_id)
  values (
    new.id,
    new.email,
    coalesce(new.raw_user_meta_data->>'full_name', split_part(new.email, '@', 1)),
    default_role_id
  );

  insert into public.user_second_factor (user_id, method)
  values (new.id, 'email');

  return new;
end;
$$;

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

grant execute on function public.get_user_areas(uuid) to authenticated;
grant execute on function public.is_admin() to authenticated;
