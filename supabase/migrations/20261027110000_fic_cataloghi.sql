-- Catalogo dei codici Fatture in Cloud (aliquote, conti).
-- Si legge da qui. Una chiamata API parte solo se il codice manca,
-- e la risposta resta salvata per le fatture successive.

create table if not exists public.fic_cataloghi (
  id uuid primary key default gen_random_uuid(),
  chiave text not null,
  payload jsonb not null default '[]'::jsonb,
  versione integer not null default 1,
  documento_stato text not null default 'approvato',
  fetched_at timestamptz not null default now(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  created_by uuid references auth.users (id) on delete set null,
  updated_by uuid references auth.users (id) on delete set null,
  deleted_at timestamptz,
  deleted_by uuid references auth.users (id) on delete set null,
  constraint fic_cataloghi_chiave_check check (
    chiave in ('vat_types', 'payment_accounts', 'quota_blocco')
  ),
  constraint fic_cataloghi_stato_check check (
    documento_stato in ('bozza', 'approvato', 'chiuso')
  ),
  constraint fic_cataloghi_versione_check check (versione >= 1)
);

create unique index if not exists fic_cataloghi_chiave_uidx
  on public.fic_cataloghi (chiave)
  where deleted_at is null;

drop trigger if exists fic_cataloghi_updated_at on public.fic_cataloghi;
create trigger fic_cataloghi_updated_at
  before update on public.fic_cataloghi
  for each row execute function public.set_updated_at();

alter table public.fic_cataloghi enable row level security;

drop policy if exists "fic_cataloghi_select" on public.fic_cataloghi;
create policy "fic_cataloghi_select"
  on public.fic_cataloghi for select to authenticated
  using (public.has_area_access('amministrazione') or public.is_superadmin());

drop policy if exists "fic_cataloghi_insert" on public.fic_cataloghi;
create policy "fic_cataloghi_insert"
  on public.fic_cataloghi for insert to authenticated
  with check (public.has_area_access('amministrazione') or public.is_superadmin());

drop policy if exists "fic_cataloghi_update" on public.fic_cataloghi;
create policy "fic_cataloghi_update"
  on public.fic_cataloghi for update to authenticated
  using (public.has_area_access('amministrazione') or public.is_superadmin())
  with check (public.has_area_access('amministrazione') or public.is_superadmin());

grant select, insert, update on table public.fic_cataloghi to authenticated;
grant all on table public.fic_cataloghi to postgres, service_role;

comment on table public.fic_cataloghi is
  'Codici Fatture in Cloud già letti. Le fatture successive riusano questa copia e non richiamano l''elenco.';

insert into public.fic_cataloghi (
  id,
  chiave,
  payload,
  versione,
  documento_stato,
  fetched_at
)
values (
  'c0ffee00-2026-4026-8000-000000000022',
  'vat_types',
  '[
    {"id":0,"value":22,"description":"22%"},
    {"id":4,"value":4,"description":"4%"},
    {"id":6,"value":0,"description":"0%"}
  ]'::jsonb,
  1,
  'approvato',
  now()
)
on conflict (id) do nothing;

insert into public.audit_log (
  entity_type,
  entity_id,
  action,
  summary,
  payload
)
select
  'fic_cataloghi',
  'c0ffee00-2026-4026-8000-000000000022',
  'create',
  'Aliquote FiC salvate dal documenti già registrati: 22% id 0, 4% id 4, 0% id 6. Nessuna nuova chiamata.',
  jsonb_build_object('chiave', 'vat_types', 'origine', 'ddt_gia_registrati')
where not exists (
  select 1
  from public.audit_log
  where entity_id = 'c0ffee00-2026-4026-8000-000000000022'
    and action = 'create'
);
