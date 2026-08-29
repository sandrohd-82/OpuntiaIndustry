-- WikiOpuntia — biblioteca scientifica pubblica
-- Accodata dopo 20260829110000_opuntiaitalia_portale_foundation.sql
-- Source of truth: OpuntiaIndustry/supabase/migrations (collegata da Wikiopuntia)

-- ---------------------------------------------------------------------------
-- Area gestionale WikiOpuntia
-- ---------------------------------------------------------------------------
insert into public.areas (slug, name, description, icon, sort_order, is_active)
values (
  'wikiopuntia',
  'WikiOpuntia',
  'Biblioteca ricerche scientifiche e pubblicazione portale wikiopuntia.com',
  'book-open',
  16,
  true
)
on conflict (slug) do update
set
  name = excluded.name,
  description = excluded.description,
  icon = excluded.icon,
  sort_order = excluded.sort_order,
  is_active = true;

insert into public.role_area_permissions (role_id, area_id, can_access)
select r.id, a.id, true
from public.app_roles r
cross join public.areas a
where a.slug = 'wikiopuntia'
  and r.code in ('superadmin', 'admin', 'manager')
on conflict (role_id, area_id) do update set can_access = true;

-- ---------------------------------------------------------------------------
-- Biblioteca scientifica (ex MySQL scientific_research)
-- ---------------------------------------------------------------------------
create table if not exists public.wiki_scientific_research (
  id uuid primary key default gen_random_uuid(),
  legacy_id int unique,
  title text not null,
  abstract text not null default '',
  slug text not null,
  plant_parts text[] not null default '{}',
  sectors text[] not null default '{}',
  is_most_searched boolean not null default false,
  is_evidence boolean not null default false,
  published_year smallint not null,
  published_month smallint not null,
  published_at timestamptz not null,
  storage_path text,
  external_link text not null default '',
  pdf_available boolean not null default false,
  status text not null default 'draft'
    check (status in ('draft', 'published', 'archived')),
  published_at_portal timestamptz,
  published_by uuid references auth.users (id) on delete set null,
  ingest_status text not null default 'pending'
    check (ingest_status in ('pending', 'processing', 'done', 'error')),
  ingest_error text not null default '',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  created_by uuid references auth.users (id) on delete set null,
  updated_by uuid references auth.users (id) on delete set null,
  deleted_at timestamptz,
  deleted_by uuid references auth.users (id) on delete set null,
  constraint wiki_scientific_research_title_len check (
    char_length(trim(title)) >= 1 and char_length(title) <= 500
  ),
  constraint wiki_scientific_research_month_check check (
    published_month between 1 and 12
  ),
  constraint wiki_scientific_research_plant_parts_check check (
    plant_parts <@ array['cladodes', 'fruits', 'flowers']::text[]
  ),
  constraint wiki_scientific_research_sectors_check check (
    sectors <@ array[
      'most_searched', 'pharma', 'nutrace', 'food',
      'cosmetic', 'veterina', 'technical', 'other'
    ]::text[]
  )
);

comment on table public.wiki_scientific_research is
  'Biblioteca pubblica WikiOpuntia — paper scientifici su Opuntia ficus-indica';

create unique index if not exists wiki_scientific_research_slug_uidx
  on public.wiki_scientific_research (slug)
  where deleted_at is null;

create index if not exists wiki_scientific_research_published_idx
  on public.wiki_scientific_research (published_at desc)
  where deleted_at is null and status = 'published';

create index if not exists wiki_scientific_research_evidence_idx
  on public.wiki_scientific_research (is_evidence, published_at desc)
  where deleted_at is null and status = 'published' and is_evidence = true;

create index if not exists wiki_scientific_research_sectors_gin
  on public.wiki_scientific_research using gin (sectors);

create index if not exists wiki_scientific_research_plant_parts_gin
  on public.wiki_scientific_research using gin (plant_parts);

create index if not exists wiki_scientific_research_fts_idx
  on public.wiki_scientific_research using gin (
    to_tsvector('english', coalesce(title, '') || ' ' || coalesce(abstract, ''))
  );

drop trigger if exists wiki_scientific_research_updated_at on public.wiki_scientific_research;
create trigger wiki_scientific_research_updated_at
  before update on public.wiki_scientific_research
  for each row execute function public.set_updated_at();

-- ---------------------------------------------------------------------------
-- Richieste documento (ex request_document)
-- ---------------------------------------------------------------------------
create table if not exists public.wiki_document_requests (
  id uuid primary key default gen_random_uuid(),
  research_id uuid not null references public.wiki_scientific_research (id) on delete cascade,
  email text not null,
  document_name text not null default '',
  locale text not null default 'it',
  notified_at timestamptz,
  created_at timestamptz not null default now(),
  constraint wiki_document_requests_locale_check check (
    locale in ('it', 'en', 'de', 'fr', 'es')
  ),
  constraint wiki_document_requests_email_len check (
    char_length(trim(email)) >= 5
  )
);

comment on table public.wiki_document_requests is
  'Richieste visitatori per PDF non disponibili pubblicamente';

create index if not exists wiki_document_requests_research_idx
  on public.wiki_document_requests (research_id, created_at desc);

create index if not exists wiki_document_requests_created_idx
  on public.wiki_document_requests (created_at desc);

-- ---------------------------------------------------------------------------
-- RLS wiki_scientific_research
-- ---------------------------------------------------------------------------
alter table public.wiki_scientific_research enable row level security;

drop policy if exists "wiki_research_select_staff" on public.wiki_scientific_research;
create policy "wiki_research_select_staff"
  on public.wiki_scientific_research for select to authenticated
  using (
    deleted_at is null
    and (public.has_area_access('wikiopuntia') or public.is_superadmin())
  );

drop policy if exists "wiki_research_select_public" on public.wiki_scientific_research;
create policy "wiki_research_select_public"
  on public.wiki_scientific_research for select to anon
  using (deleted_at is null and status = 'published');

drop policy if exists "wiki_research_insert_staff" on public.wiki_scientific_research;
create policy "wiki_research_insert_staff"
  on public.wiki_scientific_research for insert to authenticated
  with check (public.has_area_access('wikiopuntia') or public.is_superadmin());

drop policy if exists "wiki_research_update_staff" on public.wiki_scientific_research;
create policy "wiki_research_update_staff"
  on public.wiki_scientific_research for update to authenticated
  using (public.has_area_access('wikiopuntia') or public.is_superadmin())
  with check (public.has_area_access('wikiopuntia') or public.is_superadmin());

-- ---------------------------------------------------------------------------
-- RLS wiki_document_requests
-- ---------------------------------------------------------------------------
alter table public.wiki_document_requests enable row level security;

drop policy if exists "wiki_doc_req_insert_anon" on public.wiki_document_requests;
create policy "wiki_doc_req_insert_anon"
  on public.wiki_document_requests for insert to anon, authenticated
  with check (true);

drop policy if exists "wiki_doc_req_select_staff" on public.wiki_document_requests;
create policy "wiki_doc_req_select_staff"
  on public.wiki_document_requests for select to authenticated
  using (public.has_area_access('wikiopuntia') or public.is_superadmin());

drop policy if exists "wiki_doc_req_update_staff" on public.wiki_document_requests;
create policy "wiki_doc_req_update_staff"
  on public.wiki_document_requests for update to authenticated
  using (public.has_area_access('wikiopuntia') or public.is_superadmin())
  with check (public.has_area_access('wikiopuntia') or public.is_superadmin());

-- ---------------------------------------------------------------------------
-- Grants
-- ---------------------------------------------------------------------------
grant select on table public.wiki_scientific_research to anon;
grant select, insert, update on table public.wiki_scientific_research to authenticated;
grant all on table public.wiki_scientific_research to postgres, service_role;

grant insert on table public.wiki_document_requests to anon, authenticated;
grant select, update on table public.wiki_document_requests to authenticated;
grant all on table public.wiki_document_requests to postgres, service_role;

revoke delete on table public.wiki_scientific_research from authenticated;
revoke delete on table public.wiki_document_requests from authenticated;

-- ---------------------------------------------------------------------------
-- Storage bucket PDF ricerche
-- ---------------------------------------------------------------------------
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'wiki-research-pdfs',
  'wiki-research-pdfs',
  false,
  52428800,
  array['application/pdf']::text[]
)
on conflict (id) do update set
  public = excluded.public,
  file_size_limit = excluded.file_size_limit,
  allowed_mime_types = excluded.allowed_mime_types;

drop policy if exists "wiki_pdfs_storage_select_staff" on storage.objects;
create policy "wiki_pdfs_storage_select_staff"
  on storage.objects for select to authenticated
  using (
    bucket_id = 'wiki-research-pdfs'
    and (public.has_area_access('wikiopuntia') or public.is_superadmin())
  );

drop policy if exists "wiki_pdfs_storage_insert_staff" on storage.objects;
create policy "wiki_pdfs_storage_insert_staff"
  on storage.objects for insert to authenticated
  with check (
    bucket_id = 'wiki-research-pdfs'
    and (public.has_area_access('wikiopuntia') or public.is_superadmin())
  );

drop policy if exists "wiki_pdfs_storage_update_staff" on storage.objects;
create policy "wiki_pdfs_storage_update_staff"
  on storage.objects for update to authenticated
  using (
    bucket_id = 'wiki-research-pdfs'
    and (public.has_area_access('wikiopuntia') or public.is_superadmin())
  )
  with check (
    bucket_id = 'wiki-research-pdfs'
    and (public.has_area_access('wikiopuntia') or public.is_superadmin())
  );
