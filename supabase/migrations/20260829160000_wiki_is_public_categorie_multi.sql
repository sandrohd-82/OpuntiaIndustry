-- Wiki: aperta/chiusa (portale sì/no) + vista solo pubbliche
-- Accodata dopo 20260829151000
-- Categorie multi: plant_parts (cladodes/fruits/flowers) + sectors (nutrace/pharma/…)

alter table public.wiki_scientific_research
  add column if not exists is_public boolean not null default false;

comment on column public.wiki_scientific_research.is_public is
  'true = ricerca APERTA (visibile su wikiopuntia.com); false = CHIUSA (solo gestionale). Ex MySQL close: 0→true, 1→false.';

create index if not exists wiki_scientific_research_public_idx
  on public.wiki_scientific_research (is_public, status)
  where deleted_at is null;

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
  r.is_public,
  r.published_year,
  r.published_month,
  r.published_at,
  r.external_link,
  r.pdf_available,
  r.public_url,
  r.versione
from public.wiki_scientific_research r
where r.deleted_at is null
  and r.status = 'published'
  and r.is_public = true;

grant select on public.v_wiki_pubblicati to anon, authenticated;
grant all on public.v_wiki_pubblicati to postgres, service_role;

-- Anon vede solo aperte + pubblicate (ex close=0)
drop policy if exists "wiki_research_select_public" on public.wiki_scientific_research;
create policy "wiki_research_select_public"
  on public.wiki_scientific_research for select to anon
  using (
    deleted_at is null
    and status = 'published'
    and is_public = true
  );

drop policy if exists "wiki_research_select_public_auth" on public.wiki_scientific_research;
create policy "wiki_research_select_public_auth"
  on public.wiki_scientific_research for select to authenticated
  using (
    deleted_at is null
    and status = 'published'
    and is_public = true
  );

create or replace function public.match_wiki_document_chunks(
  query_embedding vector(1536),
  match_count int default 8,
  filter_source text default null
)
returns table (
  id uuid,
  research_id uuid,
  source_type text,
  content text,
  metadata jsonb,
  similarity float
)
language sql
stable
security definer
set search_path = public
as $$
  select
    c.id,
    c.research_id,
    c.source_type,
    c.content,
    c.metadata,
    1 - (c.embedding <=> query_embedding) as similarity
  from public.wiki_document_chunks c
  join public.wiki_scientific_research r on r.id = c.research_id
  where c.embedding is not null
    and r.deleted_at is null
    and r.status = 'published'
    and r.is_public = true
    and (filter_source is null or c.source_type = filter_source)
  order by c.embedding <=> query_embedding
  limit greatest(match_count, 1);
$$;
