-- Ruolo superadmin (unico), impostazioni solo a lui, helper is_superadmin

-- ---------------------------------------------------------------------------
-- Ruolo superadmin + permessi su tutte le aree
-- ---------------------------------------------------------------------------
insert into public.app_roles (code, name, description)
values (
  'superadmin',
  'Super amministratore',
  'Accesso completo e unica configurazione Google Authenticator'
)
on conflict (code) do nothing;

insert into public.role_area_permissions (role_id, area_id, can_access)
select r.id, a.id, true
from public.app_roles r
cross join public.areas a
where r.code = 'superadmin'
on conflict (role_id, area_id) do update set can_access = true;

-- Impostazioni: solo superadmin (revoca admin)
delete from public.role_area_permissions rap
using public.app_roles r, public.areas a
where rap.role_id = r.id
  and rap.area_id = a.id
  and r.code = 'admin'
  and a.slug = 'impostazioni';

update public.areas
set description = 'Configurazione sistema e Google Authenticator (solo superadmin)'
where slug = 'impostazioni';

-- ---------------------------------------------------------------------------
-- Funzioni ruolo
-- ---------------------------------------------------------------------------
create or replace function public.is_superadmin()
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
    where p.id = auth.uid() and r.code = 'superadmin' and p.is_active = true
  );
$$;

-- Admin “esteso”: admin o superadmin (policy esistenti restano valide)
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
    where p.id = auth.uid()
      and r.code in ('admin', 'superadmin')
      and p.is_active = true
  );
$$;

-- Al massimo un profilo con ruolo superadmin
create or replace function public.enforce_single_superadmin()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  super_role_id uuid;
  other_count int;
begin
  select id into super_role_id from public.app_roles where code = 'superadmin' limit 1;
  if super_role_id is null then
    return new;
  end if;

  if new.role_id = super_role_id then
    select count(*)::int into other_count
    from public.profiles
    where role_id = super_role_id
      and id <> new.id;

    if other_count > 0 then
      raise exception 'Può esistere un solo profilo superadmin';
    end if;
  end if;

  return new;
end;
$$;

drop trigger if exists profiles_single_superadmin on public.profiles;
create trigger profiles_single_superadmin
  before insert or update of role_id on public.profiles
  for each row execute function public.enforce_single_superadmin();

grant execute on function public.is_superadmin() to authenticated;
