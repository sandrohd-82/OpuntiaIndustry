-- Impostazioni ticket (ISO 9001 7.5 / 6.1): addetto risoluzione, audit, soft delete.
-- Solo Super Admin scrive. L'addetto vede e gestisce tutti i ticket aperti.

create table if not exists public.strumenti_ticket_impostazioni (
  id uuid primary key default gen_random_uuid(),
  chiave text not null default 'default',
  addetto_user_id uuid references auth.users (id) on delete set null,
  created_by uuid references auth.users (id) on delete set null,
  updated_by uuid references auth.users (id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz,
  deleted_by uuid references auth.users (id) on delete set null
);

create unique index if not exists strumenti_ticket_impostazioni_chiave_viva_uidx
  on public.strumenti_ticket_impostazioni (chiave)
  where deleted_at is null;

comment on table public.strumenti_ticket_impostazioni is
  'Impostazioni ticket (Super Admin): operatore addetto a risoluzione e notifiche.';
comment on column public.strumenti_ticket_impostazioni.addetto_user_id is
  'Unico destinatario notifiche Windows e pallini urgenza in menu.';

drop trigger if exists strumenti_ticket_impostazioni_updated_at
  on public.strumenti_ticket_impostazioni;
create trigger strumenti_ticket_impostazioni_updated_at
  before update on public.strumenti_ticket_impostazioni
  for each row execute function public.set_updated_at();

create or replace function public.ticket_addetto_user_id()
returns uuid
language sql
stable
security definer
set search_path = public
as $$
  select addetto_user_id
  from public.strumenti_ticket_impostazioni
  where deleted_at is null
    and chiave = 'default'
  limit 1;
$$;

create or replace function public.is_ticket_addetto()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select auth.uid() is not null
    and public.ticket_addetto_user_id() is not null
    and auth.uid() = public.ticket_addetto_user_id();
$$;

create or replace function public.can_see_strumenti_ticket(p_created_by uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select
    public.is_superadmin()
    or public.has_area_access('amministrazione')
    or public.is_ticket_addetto()
    or (p_created_by is not null and p_created_by = auth.uid());
$$;

create or replace function public.can_gestire_strumenti_ticket()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select
    public.is_superadmin()
    or public.has_area_access('amministrazione')
    or public.is_ticket_addetto();
$$;

alter table public.strumenti_ticket_impostazioni enable row level security;

drop policy if exists strumenti_ticket_impostazioni_select
  on public.strumenti_ticket_impostazioni;
create policy strumenti_ticket_impostazioni_select
  on public.strumenti_ticket_impostazioni for select to authenticated
  using (
    deleted_at is null
    and (
      public.is_superadmin()
      or public.has_area_access('strumenti')
      or public.has_area_access('amministrazione')
    )
  );

drop policy if exists strumenti_ticket_impostazioni_insert
  on public.strumenti_ticket_impostazioni;
create policy strumenti_ticket_impostazioni_insert
  on public.strumenti_ticket_impostazioni for insert to authenticated
  with check (public.is_superadmin());

drop policy if exists strumenti_ticket_impostazioni_update
  on public.strumenti_ticket_impostazioni;
create policy strumenti_ticket_impostazioni_update
  on public.strumenti_ticket_impostazioni for update to authenticated
  using (public.is_superadmin())
  with check (public.is_superadmin());

grant select, insert, update on table public.strumenti_ticket_impostazioni to authenticated;
grant all on table public.strumenti_ticket_impostazioni to postgres, service_role;
revoke delete on table public.strumenti_ticket_impostazioni from authenticated;

grant execute on function public.ticket_addetto_user_id() to authenticated, service_role;
grant execute on function public.is_ticket_addetto() to authenticated, service_role;
grant execute on function public.can_see_strumenti_ticket(uuid) to authenticated, service_role;
grant execute on function public.can_gestire_strumenti_ticket() to authenticated, service_role;

do $$
begin
  alter publication supabase_realtime add table public.strumenti_ticket;
exception
  when duplicate_object then null;
end $$;
