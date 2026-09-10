-- Bandiere sensori su disegno essiccatore (Action).
-- Coordinate in % dell'immagine. Scrittura solo Super Admin. Soft delete + audit app.

create table if not exists public.action_essiccatore_sensori (
  id uuid primary key default gen_random_uuid(),
  essiccatore_id text not null,
  codice text not null,
  nome text not null,
  unita text not null default '',
  x_pct numeric(6, 3) not null default 50,
  y_pct numeric(6, 3) not null default 50,
  valore_attuale text not null default '',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  created_by uuid references auth.users (id) on delete set null,
  updated_by uuid references auth.users (id) on delete set null,
  deleted_at timestamptz,
  deleted_by uuid references auth.users (id) on delete set null,
  constraint action_essiccatore_sensori_ess_check check (
    essiccatore_id in ('ess-a', 'ess-b', 'ess-ultimo-stadio')
  ),
  constraint action_essiccatore_sensori_xy_check check (
    x_pct between 0 and 100 and y_pct between 0 and 100
  ),
  constraint action_essiccatore_sensori_nome_len check (char_length(trim(nome)) >= 1)
);

create unique index if not exists action_essiccatore_sensori_codice_uidx
  on public.action_essiccatore_sensori (essiccatore_id, codice)
  where deleted_at is null;

create index if not exists action_essiccatore_sensori_ess_idx
  on public.action_essiccatore_sensori (essiccatore_id)
  where deleted_at is null;

comment on table public.action_essiccatore_sensori is
  'Sensori Action su essiccatore: posizione bandiera in % immagine. ISO 9001 audit + soft delete.';

drop trigger if exists action_essiccatore_sensori_updated_at
  on public.action_essiccatore_sensori;
create trigger action_essiccatore_sensori_updated_at
  before update on public.action_essiccatore_sensori
  for each row execute function public.set_updated_at();

alter table public.action_essiccatore_sensori enable row level security;

drop policy if exists action_essiccatore_sensori_select on public.action_essiccatore_sensori;
create policy action_essiccatore_sensori_select
  on public.action_essiccatore_sensori for select to authenticated
  using (
    public.has_area_access('action')
    or public.is_superadmin()
  );

drop policy if exists action_essiccatore_sensori_write on public.action_essiccatore_sensori;
create policy action_essiccatore_sensori_write
  on public.action_essiccatore_sensori for all to authenticated
  using (public.is_superadmin())
  with check (public.is_superadmin());

grant select, insert, update, delete on table public.action_essiccatore_sensori
  to authenticated;
grant all on table public.action_essiccatore_sensori to postgres, service_role;
