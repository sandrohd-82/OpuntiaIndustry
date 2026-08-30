-- Wiki: is_public = accesso PDF (libero vs login), non visibilità portale.
-- Invia a WikiOpuntia = status = published (resta in v_wiki_pubblicati anche se non pubblica).

comment on column public.wiki_scientific_research.is_public is
  'true = PDF scaricabile da chiunque; false = PDF solo dopo login portale. Ex MySQL close: 0→true, 1→false. Non indica l''invio al sito.';

comment on column public.wiki_scientific_research.status is
  'draft=solo gestionale; published=inviata a WikiOpuntia; archived=tolta dal portale.';

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
  case when r.is_public then r.public_url else null end as public_url,
  r.versione
from public.wiki_scientific_research r
where r.deleted_at is null
  and r.status = 'published';

alter view public.v_wiki_pubblicati set (security_invoker = false);

grant select on public.v_wiki_pubblicati to anon, authenticated;
grant all on public.v_wiki_pubblicati to postgres, service_role;

-- Catalogo: anon usa la vista (public_url già mascherato se serve login)
revoke select on table public.wiki_scientific_research from anon;

drop policy if exists "wiki_research_select_public" on public.wiki_scientific_research;
drop policy if exists "wiki_research_select_public_auth" on public.wiki_scientific_research;

create policy "wiki_research_select_portal_auth"
  on public.wiki_scientific_research for select to authenticated
  using (
    deleted_at is null
    and status = 'published'
  );

create or replace function public.wiki_research_download_url(p_research_id uuid)
returns text
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  rec record;
begin
  select r.public_url, r.is_public, r.status, r.deleted_at
    into rec
  from public.wiki_scientific_research r
  where r.id = p_research_id;

  if not found then
    return null;
  end if;
  if rec.deleted_at is not null or rec.status <> 'published' then
    return null;
  end if;
  if rec.is_public then
    return rec.public_url;
  end if;
  if auth.uid() is null then
    return null;
  end if;
  return rec.public_url;
end;
$$;

comment on function public.wiki_research_download_url(uuid) is
  'URL PDF: libero se is_public; se non pubblica richiede auth.uid() (login portale).';

grant execute on function public.wiki_research_download_url(uuid) to anon, authenticated, service_role;

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
    and (r.is_public = true or auth.uid() is not null)
    and (filter_source is null or c.source_type = filter_source)
  order by c.embedding <=> query_embedding
  limit greatest(match_count, 1);
$$;
