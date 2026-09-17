-- Clausola di attenzione per mail/telefono (valore normalizzato unico).
-- ISO 9001: audit + soft delete; nessun delete fisico. Nessun NOTIFY.

create table if not exists public.contatto_canale_attenzioni (
  id uuid primary key default gen_random_uuid(),
  canale text not null
    check (canale in ('email', 'telefono')),
  valore_normalizzato text not null,
  valore_display text not null default '',
  clausola text not null,
  created_by uuid references auth.users (id) on delete set null,
  updated_by uuid references auth.users (id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz,
  deleted_by uuid references auth.users (id) on delete set null
);

comment on table public.contatto_canale_attenzioni is
  'Clausola di attenzione per un indirizzo email o un numero di telefono. Vale ovunque compare quel valore.';

create unique index if not exists contatto_canale_attenzioni_valore_uidx
  on public.contatto_canale_attenzioni (canale, valore_normalizzato)
  where deleted_at is null;

drop trigger if exists contatto_canale_attenzioni_updated_at
  on public.contatto_canale_attenzioni;
create trigger contatto_canale_attenzioni_updated_at
  before update on public.contatto_canale_attenzioni
  for each row execute function public.set_updated_at();

alter table public.contatto_canale_attenzioni enable row level security;

drop policy if exists contatto_canale_attenzioni_all
  on public.contatto_canale_attenzioni;
create policy contatto_canale_attenzioni_all
  on public.contatto_canale_attenzioni for all to authenticated
  using (
    public.has_area_access('amministrazione')
    or public.has_area_access('commerciale')
    or public.has_area_access('webmail')
    or public.is_superadmin()
  )
  with check (
    public.has_area_access('amministrazione')
    or public.has_area_access('commerciale')
    or public.has_area_access('webmail')
    or public.is_superadmin()
  );

grant select, insert, update on table public.contatto_canale_attenzioni
  to authenticated;
grant all on table public.contatto_canale_attenzioni
  to postgres, service_role;
revoke delete on table public.contatto_canale_attenzioni from authenticated;
