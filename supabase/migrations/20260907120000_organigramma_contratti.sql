-- Contratti collegati alle schede Operatore (ISO 9001 8.5.2 / 7.5 / 6.1).
-- Collaborazione, ingaggio, tempo det./indet., stage. Soft delete, stato, versione.

create table if not exists public.organigramma_contratti (
  id uuid primary key default gen_random_uuid(),
  persona_id uuid not null references public.organigramma_persone (id),
  tipologia text not null
    check (tipologia in (
      'tempo_indeterminato',
      'tempo_determinato',
      'collaborazione',
      'ingaggio',
      'stage',
      'altro'
    )),
  titolo text not null,
  data_inizio date not null,
  data_fine date,
  importo numeric(12, 2),
  note text not null default '',
  storage_path text not null,
  file_name text not null default '',
  mime text not null default '',
  documento_stato text not null default 'bozza'
    check (documento_stato in ('bozza', 'approvato', 'chiuso')),
  versione integer not null default 1,
  approved_by uuid references auth.users (id) on delete set null,
  approved_at timestamptz,
  created_by uuid references auth.users (id) on delete set null,
  updated_by uuid references auth.users (id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz,
  deleted_by uuid references auth.users (id) on delete set null,
  constraint organigramma_contratti_date_check
    check (data_fine is null or data_fine >= data_inizio),
  constraint organigramma_contratti_indet_check
    check (
      tipologia <> 'tempo_indeterminato'
      or data_fine is null
    )
);

create index if not exists organigramma_contratti_persona_idx
  on public.organigramma_contratti (persona_id, data_inizio desc)
  where deleted_at is null;

comment on table public.organigramma_contratti is
  'Contratti di lavoro/incarico sempre collegati a una scheda Operatore.';

drop trigger if exists organigramma_contratti_updated_at on public.organigramma_contratti;
create trigger organigramma_contratti_updated_at
  before update on public.organigramma_contratti
  for each row execute function public.set_updated_at();

alter table public.organigramma_contratti enable row level security;

drop policy if exists organigramma_contratti_select on public.organigramma_contratti;
create policy organigramma_contratti_select
  on public.organigramma_contratti for select to authenticated
  using (
    public.has_area_access('amministrazione') or public.is_superadmin()
  );

drop policy if exists organigramma_contratti_write on public.organigramma_contratti;
create policy organigramma_contratti_write
  on public.organigramma_contratti for insert to authenticated
  with check (public.is_admin() or public.is_superadmin());

drop policy if exists organigramma_contratti_update on public.organigramma_contratti;
create policy organigramma_contratti_update
  on public.organigramma_contratti for update to authenticated
  using (public.is_admin() or public.is_superadmin())
  with check (public.is_admin() or public.is_superadmin());

grant select on table public.organigramma_contratti to authenticated;
grant insert, update on table public.organigramma_contratti to authenticated;
grant all on table public.organigramma_contratti to postgres, service_role;
revoke delete on table public.organigramma_contratti from authenticated;
