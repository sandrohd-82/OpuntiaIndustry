-- ISO 9001: contributi cassa previdenziale + totale FiC per controllo incrociato
-- su fatture ricevute (audit, soft delete, RLS amministrazione).

alter table public.fatture_ricevute
  add column if not exists totale_fic numeric(14, 2),
  add column if not exists totale_scarto numeric(14, 2);

comment on column public.fatture_ricevute.totale_fic is
  'Totale lordo da Fatture in Cloud (amount_gross) per controllo vs totale calcolato';
comment on column public.fatture_ricevute.totale_scarto is
  'Differenza totale documento − totale_fic (null se totale_fic assente)';

create table if not exists public.fatture_ricevute_contributi_cassa (
  id uuid primary key default gen_random_uuid(),
  fattura_id uuid not null references public.fatture_ricevute (id) on delete cascade,
  codice text not null default '',
  percentuale numeric(8, 4) not null default 0,
  base_importo numeric(14, 2) not null default 0,
  importo numeric(14, 2) not null default 0,
  sort_order integer not null default 0,
  note text not null default '',
  created_by uuid references auth.users (id) on delete set null,
  updated_by uuid references auth.users (id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz,
  deleted_by uuid references auth.users (id) on delete set null,
  constraint fatture_ricevute_contributi_cassa_pct_check check (
    percentuale >= 0 and percentuale <= 100
  ),
  constraint fatture_ricevute_contributi_cassa_base_check check (base_importo >= 0),
  constraint fatture_ricevute_contributi_cassa_importo_check check (importo >= 0)
);

comment on table public.fatture_ricevute_contributi_cassa is
  'Contributi cassa previdenziale su fattura ricevuta (es. ENPAB 4%) — soft delete';

create index if not exists fatture_ricevute_contributi_cassa_fattura_idx
  on public.fatture_ricevute_contributi_cassa (fattura_id, sort_order)
  where deleted_at is null;

drop trigger if exists fatture_ricevute_contributi_cassa_updated_at
  on public.fatture_ricevute_contributi_cassa;
create trigger fatture_ricevute_contributi_cassa_updated_at
  before update on public.fatture_ricevute_contributi_cassa
  for each row execute function public.set_updated_at();

alter table public.fatture_ricevute_contributi_cassa enable row level security;

drop policy if exists "fatture_ricevute_contributi_cassa_select"
  on public.fatture_ricevute_contributi_cassa;
create policy "fatture_ricevute_contributi_cassa_select"
  on public.fatture_ricevute_contributi_cassa for select to authenticated
  using (public.has_area_access('amministrazione') or public.is_superadmin());

drop policy if exists "fatture_ricevute_contributi_cassa_insert"
  on public.fatture_ricevute_contributi_cassa;
create policy "fatture_ricevute_contributi_cassa_insert"
  on public.fatture_ricevute_contributi_cassa for insert to authenticated
  with check (public.has_area_access('amministrazione') or public.is_superadmin());

drop policy if exists "fatture_ricevute_contributi_cassa_update"
  on public.fatture_ricevute_contributi_cassa;
create policy "fatture_ricevute_contributi_cassa_update"
  on public.fatture_ricevute_contributi_cassa for update to authenticated
  using (public.has_area_access('amministrazione') or public.is_superadmin())
  with check (public.has_area_access('amministrazione') or public.is_superadmin());

drop policy if exists "fatture_ricevute_contributi_cassa_delete"
  on public.fatture_ricevute_contributi_cassa;
create policy "fatture_ricevute_contributi_cassa_delete"
  on public.fatture_ricevute_contributi_cassa for delete to authenticated
  using (public.has_area_access('amministrazione') or public.is_superadmin());

grant select, insert, update, delete
  on table public.fatture_ricevute_contributi_cassa to authenticated;
grant all on table public.fatture_ricevute_contributi_cassa
  to postgres, service_role;
