-- Chat share allegati: message_kind + payload + sondaggi (ISO 9001 audit/soft-delete)

-- ---------------------------------------------------------------------------
-- messages: tipizzazione allegati speciali
-- ---------------------------------------------------------------------------
alter table public.messages
  add column if not exists message_kind text not null default 'text',
  add column if not exists payload jsonb not null default '{}'::jsonb;

do $$
begin
  if not exists (
    select 1 from pg_constraint
    where conname = 'messages_message_kind_check'
  ) then
    alter table public.messages
      add constraint messages_message_kind_check
      check (
        message_kind in (
          'text', 'audio', 'file', 'location', 'contact', 'poll', 'scheda'
        )
      );
  end if;
end $$;

comment on column public.messages.message_kind is
  'Tipo messaggio: text|audio|file|location|contact|poll|scheda';
comment on column public.messages.payload is
  'Metadati tipizzati (location, contact, scheda, poll_id, …)';

create index if not exists messages_kind_idx
  on public.messages (conversation_id, message_kind)
  where deleted_at is null;

-- ---------------------------------------------------------------------------
-- chat_polls
-- ---------------------------------------------------------------------------
create table if not exists public.chat_polls (
  id uuid primary key default gen_random_uuid(),
  message_id uuid not null references public.messages (id) on delete cascade,
  conversation_id uuid not null references public.conversations (id) on delete cascade,
  titolo text not null,
  stato text not null default 'aperto'
    check (stato in ('aperto', 'chiuso')),
  versione integer not null default 1,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  created_by uuid references auth.users (id) on delete set null,
  updated_by uuid references auth.users (id) on delete set null,
  deleted_at timestamptz,
  deleted_by uuid references auth.users (id) on delete set null
);

create unique index if not exists chat_polls_message_uidx
  on public.chat_polls (message_id)
  where deleted_at is null;

create index if not exists chat_polls_conversation_idx
  on public.chat_polls (conversation_id)
  where deleted_at is null;

drop trigger if exists chat_polls_updated_at on public.chat_polls;
create trigger chat_polls_updated_at
  before update on public.chat_polls
  for each row execute function public.set_updated_at();

alter table public.chat_polls enable row level security;

drop policy if exists "chat_polls_select" on public.chat_polls;
create policy "chat_polls_select"
  on public.chat_polls for select to authenticated
  using (
    deleted_at is null
    and public.is_conversation_participant(conversation_id)
  );

drop policy if exists "chat_polls_insert" on public.chat_polls;
create policy "chat_polls_insert"
  on public.chat_polls for insert to authenticated
  with check (
    created_by = auth.uid()
    and public.is_conversation_participant(conversation_id)
  );

drop policy if exists "chat_polls_update" on public.chat_polls;
create policy "chat_polls_update"
  on public.chat_polls for update to authenticated
  using (
    deleted_at is null
    and public.is_conversation_participant(conversation_id)
  )
  with check (public.is_conversation_participant(conversation_id));

grant select, insert, update on table public.chat_polls to authenticated;
grant all on table public.chat_polls to postgres, service_role;
revoke delete on table public.chat_polls from authenticated;

-- ---------------------------------------------------------------------------
-- chat_poll_options
-- ---------------------------------------------------------------------------
create table if not exists public.chat_poll_options (
  id uuid primary key default gen_random_uuid(),
  poll_id uuid not null references public.chat_polls (id) on delete cascade,
  label text not null,
  sort_order integer not null default 0,
  created_at timestamptz not null default now(),
  created_by uuid references auth.users (id) on delete set null,
  deleted_at timestamptz,
  deleted_by uuid references auth.users (id) on delete set null
);

create index if not exists chat_poll_options_poll_idx
  on public.chat_poll_options (poll_id, sort_order)
  where deleted_at is null;

alter table public.chat_poll_options enable row level security;

drop policy if exists "chat_poll_options_select" on public.chat_poll_options;
create policy "chat_poll_options_select"
  on public.chat_poll_options for select to authenticated
  using (
    deleted_at is null
    and exists (
      select 1 from public.chat_polls p
      where p.id = poll_id
        and p.deleted_at is null
        and public.is_conversation_participant(p.conversation_id)
    )
  );

drop policy if exists "chat_poll_options_insert" on public.chat_poll_options;
create policy "chat_poll_options_insert"
  on public.chat_poll_options for insert to authenticated
  with check (
    created_by = auth.uid()
    and exists (
      select 1 from public.chat_polls p
      where p.id = poll_id
        and p.deleted_at is null
        and public.is_conversation_participant(p.conversation_id)
    )
  );

grant select, insert on table public.chat_poll_options to authenticated;
grant all on table public.chat_poll_options to postgres, service_role;
revoke update, delete on table public.chat_poll_options from authenticated;

-- ---------------------------------------------------------------------------
-- chat_poll_votes (1 voto per utente per sondaggio)
-- ---------------------------------------------------------------------------
create table if not exists public.chat_poll_votes (
  id uuid primary key default gen_random_uuid(),
  poll_id uuid not null references public.chat_polls (id) on delete cascade,
  option_id uuid not null references public.chat_poll_options (id) on delete cascade,
  user_id uuid not null references auth.users (id) on delete cascade,
  created_at timestamptz not null default now(),
  created_by uuid references auth.users (id) on delete set null,
  deleted_at timestamptz,
  deleted_by uuid references auth.users (id) on delete set null
);

create unique index if not exists chat_poll_votes_one_uidx
  on public.chat_poll_votes (poll_id, user_id)
  where deleted_at is null;

create index if not exists chat_poll_votes_option_idx
  on public.chat_poll_votes (option_id)
  where deleted_at is null;

alter table public.chat_poll_votes enable row level security;

drop policy if exists "chat_poll_votes_select" on public.chat_poll_votes;
create policy "chat_poll_votes_select"
  on public.chat_poll_votes for select to authenticated
  using (
    deleted_at is null
    and exists (
      select 1 from public.chat_polls p
      where p.id = poll_id
        and p.deleted_at is null
        and public.is_conversation_participant(p.conversation_id)
    )
  );

drop policy if exists "chat_poll_votes_insert" on public.chat_poll_votes;
create policy "chat_poll_votes_insert"
  on public.chat_poll_votes for insert to authenticated
  with check (
    user_id = auth.uid()
    and created_by = auth.uid()
    and exists (
      select 1 from public.chat_polls p
      where p.id = poll_id
        and p.deleted_at is null
        and p.stato = 'aperto'
        and public.is_conversation_participant(p.conversation_id)
    )
  );

grant select, insert on table public.chat_poll_votes to authenticated;
grant all on table public.chat_poll_votes to postgres, service_role;
revoke update, delete on table public.chat_poll_votes from authenticated;

-- Mittente può aggiornare il proprio messaggio (es. payload pollId dopo create)
drop policy if exists "messages_update_own" on public.messages;
create policy "messages_update_own"
  on public.messages for update to authenticated
  using (
    deleted_at is null
    and sender_id = auth.uid()
    and public.is_conversation_participant(conversation_id)
  )
  with check (
    sender_id = auth.uid()
    and public.is_conversation_participant(conversation_id)
  );

alter table public.chat_polls replica identity full;
alter table public.chat_poll_votes replica identity full;

do $$
begin
  begin
    alter publication supabase_realtime add table public.chat_polls;
  exception when duplicate_object then null;
  end;
  begin
    alter publication supabase_realtime add table public.chat_poll_votes;
  exception when duplicate_object then null;
  end;
end $$;
