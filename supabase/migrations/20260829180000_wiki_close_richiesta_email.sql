-- close=1: niente download diretto (nemmeno dopo login). Serve richiesta + email operatore.

comment on column public.wiki_scientific_research.is_public is
  'true = close 0, PDF scaricabile da chiunque; false = close 1, login + richiesta (wiki_document_requests), operatore invia via email. Non è l''invio al portale.';

comment on table public.wiki_document_requests is
  'Richieste PDF non pubblici (close=1). L''operatore invia la ricerca via email; notified_at = email spedita.';

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
  -- Solo close=0 / pubblica. Le non pubbliche non hanno mai URL.
  if rec.is_public then
    return rec.public_url;
  end if;
  return null;
end;
$$;

comment on function public.wiki_research_download_url(uuid) is
  'URL PDF solo se is_public (close=0). Se close=1 restituisce null: usare wiki_document_requests.';

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

drop policy if exists "wiki_doc_req_insert_anon" on public.wiki_document_requests;
create policy "wiki_doc_req_insert_auth"
  on public.wiki_document_requests for insert to authenticated
  with check (true);

revoke insert on table public.wiki_document_requests from anon;
grant insert on table public.wiki_document_requests to authenticated;
