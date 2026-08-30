-- Completa 20260829150000 se interrotta sul REPLACE della vista
-- (PG: cannot change name of view column plant_parts to authors)

alter table public.wiki_scientific_research
  add column if not exists authors text[] not null default '{}',
  add column if not exists keywords text[] not null default '{}',
  add column if not exists category text not null default '',
  add column if not exists ai_summary text not null default '',
  add column if not exists public_url text not null default '',
  add column if not exists legacy_path text not null default '',
  add column if not exists legacy_file text not null default '';

drop view if exists public.v_wiki_pubblicati;

create or replace view public.v_wiki_pubblicati
as
select
  r.id,
  r.slug,
  r.title,
  r.abstract,
  r.authors,
  r.keywords,
  r.category,
  r.ai_summary,
  r.plant_parts,
  r.sectors,
  r.is_most_searched,
  r.is_evidence,
  r.published_year,
  r.published_month,
  r.published_at,
  r.external_link,
  r.pdf_available,
  r.public_url,
  r.versione
from public.wiki_scientific_research r
where r.deleted_at is null
  and r.status = 'published';

grant select on public.v_wiki_pubblicati to anon, authenticated;
grant all on public.v_wiki_pubblicati to postgres, service_role;

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'wikiopuntia-docs',
  'wikiopuntia-docs',
  true,
  52428800,
  array['application/pdf']::text[]
)
on conflict (id) do update set
  public = true,
  file_size_limit = excluded.file_size_limit,
  allowed_mime_types = excluded.allowed_mime_types;

drop policy if exists "wikiopuntia_docs_select_public" on storage.objects;
create policy "wikiopuntia_docs_select_public"
  on storage.objects for select
  to anon, authenticated
  using (bucket_id = 'wikiopuntia-docs');

drop policy if exists "wikiopuntia_docs_insert_staff" on storage.objects;
create policy "wikiopuntia_docs_insert_staff"
  on storage.objects for insert
  to authenticated
  with check (
    bucket_id = 'wikiopuntia-docs'
    and (public.has_area_access('wikiopuntia') or public.is_superadmin())
  );

drop policy if exists "wikiopuntia_docs_update_staff" on storage.objects;
create policy "wikiopuntia_docs_update_staff"
  on storage.objects for update
  to authenticated
  using (
    bucket_id = 'wikiopuntia-docs'
    and (public.has_area_access('wikiopuntia') or public.is_superadmin())
  )
  with check (
    bucket_id = 'wikiopuntia-docs'
    and (public.has_area_access('wikiopuntia') or public.is_superadmin())
  );
