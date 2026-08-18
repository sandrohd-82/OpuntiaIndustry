-- ISO 9001: periodi trimestre commercialista modificabili (dal/al) + lettura fatture da area-fiscale

create table if not exists public.trimestri_commercialista (
  id uuid primary key default gen_random_uuid(),
  anno integer not null,
  trimestre integer not null,
  dal date not null,
  al date not null,
  note text not null default '',
  created_by uuid references auth.users (id) on delete set null,
  updated_by uuid references auth.users (id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz,
  deleted_by uuid references auth.users (id) on delete set null,
  constraint trimestri_commercialista_anno_check check (anno >= 2000 and anno <= 2100),
  constraint trimestri_commercialista_trim_check check (trimestre between 1 and 4),
  constraint trimestri_commercialista_range_check check (dal <= al)
);

comment on table public.trimestri_commercialista is
  'Date dal/al personalizzate per trimestre commercialista (default = calendario se assente)';

create unique index if not exists trimestri_commercialista_anno_trim_uidx
  on public.trimestri_commercialista (anno, trimestre)
  where deleted_at is null;

drop trigger if exists trimestri_commercialista_updated_at
  on public.trimestri_commercialista;
create trigger trimestri_commercialista_updated_at
  before update on public.trimestri_commercialista
  for each row execute function public.set_updated_at();

alter table public.trimestri_commercialista enable row level security;

drop policy if exists "trimestri_commercialista_select" on public.trimestri_commercialista;
create policy "trimestri_commercialista_select"
  on public.trimestri_commercialista for select to authenticated
  using (
    public.has_area_access('area-fiscale')
    or public.has_area_access('amministrazione')
    or public.is_superadmin()
  );

drop policy if exists "trimestri_commercialista_insert" on public.trimestri_commercialista;
create policy "trimestri_commercialista_insert"
  on public.trimestri_commercialista for insert to authenticated
  with check (
    public.has_area_access('area-fiscale')
    or public.has_area_access('amministrazione')
    or public.is_superadmin()
  );

drop policy if exists "trimestri_commercialista_update" on public.trimestri_commercialista;
create policy "trimestri_commercialista_update"
  on public.trimestri_commercialista for update to authenticated
  using (
    public.has_area_access('area-fiscale')
    or public.has_area_access('amministrazione')
    or public.is_superadmin()
  )
  with check (
    public.has_area_access('area-fiscale')
    or public.has_area_access('amministrazione')
    or public.is_superadmin()
  );

grant select, insert, update on table public.trimestri_commercialista to authenticated;
grant all on table public.trimestri_commercialista to postgres, service_role;

-- Lettura fatture da Area Fiscale (riepilogo commercialista)
drop policy if exists "fatture_emesse_select_area_fiscale" on public.fatture_emesse;
create policy "fatture_emesse_select_area_fiscale"
  on public.fatture_emesse for select to authenticated
  using (public.has_area_access('area-fiscale') or public.is_superadmin());

drop policy if exists "fatture_emesse_righe_select_area_fiscale" on public.fatture_emesse_righe;
create policy "fatture_emesse_righe_select_area_fiscale"
  on public.fatture_emesse_righe for select to authenticated
  using (public.has_area_access('area-fiscale') or public.is_superadmin());

drop policy if exists "fatture_ricevute_select_area_fiscale" on public.fatture_ricevute;
create policy "fatture_ricevute_select_area_fiscale"
  on public.fatture_ricevute for select to authenticated
  using (public.has_area_access('area-fiscale') or public.is_superadmin());

drop policy if exists "fatture_ricevute_righe_select_area_fiscale" on public.fatture_ricevute_righe;
create policy "fatture_ricevute_righe_select_area_fiscale"
  on public.fatture_ricevute_righe for select to authenticated
  using (public.has_area_access('area-fiscale') or public.is_superadmin());
