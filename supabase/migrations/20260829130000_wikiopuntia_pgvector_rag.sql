-- WikiOpuntia — pgvector, chunk RAG, chat pubblica
-- Accodata dopo 20260829120000_wikiopuntia_foundation.sql

create extension if not exists vector;

-- ---------------------------------------------------------------------------
-- Chunk documenti per RAG
-- ---------------------------------------------------------------------------
create table if not exists public.wiki_document_chunks (
  id uuid primary key default gen_random_uuid(),
  research_id uuid references public.wiki_scientific_research (id) on delete cascade,
  source_type text not null
    check (source_type in ('abstract', 'pdf', 'article')),
  chunk_index int not null,
  content text not null,
  metadata jsonb not null default '{}'::jsonb,
  embedding vector(1536),
  token_count int not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint wiki_document_chunks_unique
    unique (research_id, source_type, chunk_index)
);

comment on table public.wiki_document_chunks is
  'Chunk testuali + embedding per chatbot RAG WikiOpuntia';

create index if not exists wiki_document_chunks_research_idx
  on public.wiki_document_chunks (research_id, source_type);

create index if not exists wiki_document_chunks_embedding_idx
  on public.wiki_document_chunks
  using hnsw (embedding vector_cosine_ops);

drop trigger if exists wiki_document_chunks_updated_at on public.wiki_document_chunks;
create trigger wiki_document_chunks_updated_at
  before update on public.wiki_document_chunks
  for each row execute function public.set_updated_at();

-- ---------------------------------------------------------------------------
-- Sessioni chat pubbliche (anonime)
-- ---------------------------------------------------------------------------
create table if not exists public.wiki_chat_sessions (
  id uuid primary key default gen_random_uuid(),
  locale text not null default 'it',
  user_agent_hash text not null default '',
  created_at timestamptz not null default now(),
  constraint wiki_chat_sessions_locale_check check (
    locale in ('it', 'en', 'de', 'fr', 'es')
  )
);

create table if not exists public.wiki_chat_messages (
  id uuid primary key default gen_random_uuid(),
  session_id uuid not null references public.wiki_chat_sessions (id) on delete cascade,
  role text not null check (role in ('user', 'assistant', 'system')),
  content text not null,
  sources jsonb not null default '[]'::jsonb,
  created_at timestamptz not null default now()
);

create index if not exists wiki_chat_messages_session_idx
  on public.wiki_chat_messages (session_id, created_at asc);

-- ---------------------------------------------------------------------------
-- RPC semantic search
-- ---------------------------------------------------------------------------
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
    and (filter_source is null or c.source_type = filter_source)
  order by c.embedding <=> query_embedding
  limit greatest(match_count, 1);
$$;

grant execute on function public.match_wiki_document_chunks(vector, int, text) to anon, authenticated, service_role;

-- ---------------------------------------------------------------------------
-- RLS
-- ---------------------------------------------------------------------------
alter table public.wiki_document_chunks enable row level security;
alter table public.wiki_chat_sessions enable row level security;
alter table public.wiki_chat_messages enable row level security;

drop policy if exists "wiki_chunks_select_staff" on public.wiki_document_chunks;
create policy "wiki_chunks_select_staff"
  on public.wiki_document_chunks for select to authenticated
  using (public.has_area_access('wikiopuntia') or public.is_superadmin());

drop policy if exists "wiki_chunks_all_service" on public.wiki_document_chunks;
create policy "wiki_chunks_all_service"
  on public.wiki_document_chunks for all to service_role
  using (true) with check (true);

drop policy if exists "wiki_chat_sessions_insert_anon" on public.wiki_chat_sessions;
create policy "wiki_chat_sessions_insert_anon"
  on public.wiki_chat_sessions for insert to anon, authenticated
  with check (true);

drop policy if exists "wiki_chat_sessions_select_anon" on public.wiki_chat_sessions;
create policy "wiki_chat_sessions_select_anon"
  on public.wiki_chat_sessions for select to anon, authenticated
  using (true);

drop policy if exists "wiki_chat_messages_insert_anon" on public.wiki_chat_messages;
create policy "wiki_chat_messages_insert_anon"
  on public.wiki_chat_messages for insert to anon, authenticated
  with check (true);

drop policy if exists "wiki_chat_messages_select_anon" on public.wiki_chat_messages;
create policy "wiki_chat_messages_select_anon"
  on public.wiki_chat_messages for select to anon, authenticated
  using (true);

drop policy if exists "wiki_chat_select_staff" on public.wiki_chat_messages;
create policy "wiki_chat_select_staff"
  on public.wiki_chat_messages for select to authenticated
  using (public.has_area_access('wikiopuntia') or public.is_superadmin());

grant select on table public.wiki_document_chunks to authenticated;
grant all on table public.wiki_document_chunks to postgres, service_role;

grant insert, select on table public.wiki_chat_sessions to anon, authenticated;
grant insert, select on table public.wiki_chat_messages to anon, authenticated;
grant select on table public.wiki_chat_messages to authenticated;
grant all on table public.wiki_chat_sessions to postgres, service_role;
grant all on table public.wiki_chat_messages to postgres, service_role;
