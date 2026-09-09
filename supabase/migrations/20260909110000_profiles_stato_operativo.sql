-- Stato operativo del profilo (LED): operativo / sospeso / bloccato
-- ISO 9001: chi/quando; solo Super Admin in switch può cambiare.

alter table public.profiles
  add column if not exists stato_operativo text not null default 'operativo',
  add column if not exists stato_operativo_at timestamptz,
  add column if not exists stato_operativo_by uuid references auth.users (id) on delete set null;

alter table public.profiles
  drop constraint if exists profiles_stato_operativo_check;

alter table public.profiles
  add constraint profiles_stato_operativo_check
  check (stato_operativo in ('operativo', 'sospeso', 'bloccato'));

comment on column public.profiles.stato_operativo is
  'LED profilo: operativo (verde), sospeso (giallo), bloccato (rosso). Login consentito solo se operativo.';

create index if not exists profiles_stato_operativo_idx
  on public.profiles (stato_operativo)
  where is_active = true;

create or replace function public.enforce_stato_operativo_switch()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if NEW.stato_operativo is not distinct from OLD.stato_operativo then
    return NEW;
  end if;

  -- service_role (azioni server già autorizzate)
  if auth.uid() is null then
    return NEW;
  end if;

  if not exists (
    select 1
    from public.profiles p
    join public.app_roles r on r.id = p.role_id
    where p.id = auth.uid()
      and r.code = 'superadmin'
      and p.is_active = true
  ) then
    raise exception 'Solo il Super Admin può modificare lo stato operativo';
  end if;

  if not exists (
    select 1
    from public.impersonation_sessions s
    where s.actor_user_id = auth.uid()
      and s.target_user_id = NEW.id
      and s.ended_at is null
      and s.deleted_at is null
  ) then
    raise exception 'Lo stato si modifica solo dopo lo switch nel profilo';
  end if;

  return NEW;
end;
$$;

drop trigger if exists profiles_stato_operativo_switch on public.profiles;
create trigger profiles_stato_operativo_switch
  before update of stato_operativo on public.profiles
  for each row execute function public.enforce_stato_operativo_switch();
