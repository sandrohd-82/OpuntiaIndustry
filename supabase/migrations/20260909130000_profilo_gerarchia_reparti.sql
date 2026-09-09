-- Gerarchia profili + reparti operativi + collegamento organigramma
-- ISO 9001: audit, soft delete, nessuno switch su Super Admin operativo.

alter table public.profiles
  add column if not exists gerarchia text not null default 'operatore',
  add column if not exists potere text not null default 'operatore';

alter table public.profiles
  drop constraint if exists profiles_gerarchia_check;
alter table public.profiles
  add constraint profiles_gerarchia_check
  check (gerarchia in (
    'amministratore',
    'segnor',
    'capo_area',
    'responsabile',
    'operatore'
  ));

alter table public.profiles
  drop constraint if exists profiles_potere_check;
alter table public.profiles
  add constraint profiles_potere_check
  check (potere in ('superadmin', 'operatore'));

comment on column public.profiles.gerarchia is
  'Tipo profilo: Amministratore > Segnor > Capo Area > Responsabile > Operatore. Switch sui subalterni.';
comment on column public.profiles.potere is
  'Poteri di sistema: superadmin (tutti i profili) o operatore (solo subalterni).';

update public.profiles p
set
  potere = 'superadmin',
  gerarchia = 'amministratore'
from public.app_roles r
where p.role_id = r.id
  and r.code = 'superadmin';

update public.profiles p
set gerarchia = 'amministratore'
from public.app_roles r
where p.role_id = r.id
  and r.code = 'admin'
  and p.gerarchia = 'operatore';

update public.profiles p
set gerarchia = 'responsabile'
from public.app_roles r
where p.role_id = r.id
  and r.code = 'manager'
  and p.gerarchia = 'operatore';

update public.profiles
set gerarchia = 'segnor'
where lower(email) = 'seleniarcurella@gmail.com';

create table if not exists public.profile_reparti (
  id uuid primary key default gen_random_uuid(),
  profile_id uuid not null references public.profiles (id) on delete cascade,
  codice text not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  created_by uuid references auth.users (id) on delete set null,
  updated_by uuid references auth.users (id) on delete set null,
  deleted_at timestamptz,
  deleted_by uuid references auth.users (id) on delete set null,
  constraint profile_reparti_codice_check
    check (codice in (
      'uffici',
      'commerciale',
      'produzione',
      'movimentazione',
      'pulizia_sanificazione',
      'magazzino'
    ))
);

create unique index if not exists profile_reparti_profile_codice_uidx
  on public.profile_reparti (profile_id, codice)
  where deleted_at is null;

create index if not exists profile_reparti_profile_idx
  on public.profile_reparti (profile_id)
  where deleted_at is null;

drop trigger if exists profile_reparti_updated_at on public.profile_reparti;
create trigger profile_reparti_updated_at
  before update on public.profile_reparti
  for each row execute function public.set_updated_at();

comment on table public.profile_reparti is
  'Reparti in cui opera il profilo gestionale. Soft delete. ISO 9001.';

alter table public.profile_reparti enable row level security;

drop policy if exists "profile_reparti_select_own" on public.profile_reparti;
create policy "profile_reparti_select_own"
  on public.profile_reparti for select to authenticated
  using (
    profile_id = public.app_effective_uid()
    or public.is_admin()
    or public.is_superadmin()
  );

grant select on table public.profile_reparti to authenticated;
grant all on table public.profile_reparti to postgres, service_role;
revoke insert, update, delete on table public.profile_reparti from authenticated;

insert into public.organigramma_reparti (codice, nome, descrizione)
select v.codice, v.nome, v.descrizione
from (values
  ('commerciale', 'Commerciale', 'Area commerciale'),
  ('produzione', 'Produzione', 'Reparto produzione'),
  ('magazzino', 'Magazzino', 'Reparto magazzino'),
  ('pulizia-sanificazione', 'Pulizia e sanificazione', 'Pulizia e sanificazione')
) as v(codice, nome, descrizione)
where not exists (
  select 1 from public.organigramma_reparti r
  where lower(r.codice) = v.codice and r.deleted_at is null
);
