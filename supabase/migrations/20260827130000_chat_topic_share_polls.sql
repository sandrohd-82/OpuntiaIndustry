-- Condividi / sondaggi anche sugli argomenti (chat_topic_messages)
-- ISO 9001: audit già su polls; soft delete; RLS membri topic

-- ---------------------------------------------------------------------------
-- chat_topic_messages: tipizzazione allegati speciali
-- ---------------------------------------------------------------------------
alter table public.chat_topic_messages
  add column if not exists message_kind text not null default 'text',
  add column if not exists payload jsonb not null default '{}'::jsonb;

do $$
begin
  if not exists (
    select 1 from pg_constraint
    where conname = 'chat_topic_messages_message_kind_check'
  ) then
    alter table public.chat_topic_messages
      add constraint chat_topic_messages_message_kind_check
      check (
        message_kind in (
          'text', 'audio', 'file', 'location', 'contact', 'poll', 'scheda'
        )
      );
  end if;
end $$;

comment on column public.chat_topic_messages.message_kind is
  'Tipo messaggio: text|audio|file|location|contact|poll|scheda';
comment on column public.chat_topic_messages.payload is
  'Metadati tipizzati (location, contact, scheda, pollId, …)';

create index if not exists chat_topic_messages_kind_idx
  on public.chat_topic_messages (topic_id, message_kind)
  where deleted_at is null;

-- Mittente può aggiornare il proprio messaggio (payload pollId);
-- i peer restano autorizzati agli update di lettura (policy precedente era solo peer).
drop policy if exists "chat_topic_messages_update" on public.chat_topic_messages;
drop policy if exists "chat_topic_messages_update_own" on public.chat_topic_messages;
drop policy if exists "chat_topic_messages_update_peer" on public.chat_topic_messages;

create policy "chat_topic_messages_update_own"
  on public.chat_topic_messages for update to authenticated
  using (
    deleted_at is null
    and sender_id = auth.uid()
    and public.is_chat_topic_member(topic_id)
  )
  with check (
    sender_id = auth.uid()
    and public.is_chat_topic_member(topic_id)
  );

create policy "chat_topic_messages_update_peer"
  on public.chat_topic_messages for update to authenticated
  using (
    deleted_at is null
    and sender_id <> auth.uid()
    and public.is_chat_topic_member(topic_id)
  )
  with check (
    sender_id <> auth.uid()
    and public.is_chat_topic_member(topic_id)
  );

-- ---------------------------------------------------------------------------
-- chat_polls: scope conversazione 1:1 OPPURE argomento
-- ---------------------------------------------------------------------------
alter table public.chat_polls
  alter column conversation_id drop not null;

alter table public.chat_polls
  add column if not exists topic_id uuid references public.chat_topics (id) on delete cascade;

-- message_id non più solo su messages (può essere chat_topic_messages)
do $$
begin
  if exists (
    select 1 from pg_constraint
    where conname = 'chat_polls_message_id_fkey'
  ) then
    alter table public.chat_polls drop constraint chat_polls_message_id_fkey;
  end if;
end $$;

do $$
begin
  if not exists (
    select 1 from pg_constraint
    where conname = 'chat_polls_scope_check'
  ) then
    alter table public.chat_polls
      add constraint chat_polls_scope_check
      check (
        (conversation_id is not null and topic_id is null)
        or (conversation_id is null and topic_id is not null)
      );
  end if;
end $$;

create index if not exists chat_polls_topic_idx
  on public.chat_polls (topic_id)
  where deleted_at is null and topic_id is not null;

create or replace function public.can_access_chat_poll(p_poll_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.chat_polls p
    where p.id = p_poll_id
      and p.deleted_at is null
      and (
        (p.conversation_id is not null
          and public.is_conversation_participant(p.conversation_id))
        or (p.topic_id is not null
          and public.is_chat_topic_member(p.topic_id))
      )
  );
$$;

grant execute on function public.can_access_chat_poll(uuid) to authenticated;

drop policy if exists "chat_polls_select" on public.chat_polls;
create policy "chat_polls_select"
  on public.chat_polls for select to authenticated
  using (
    deleted_at is null
    and (
      (conversation_id is not null
        and public.is_conversation_participant(conversation_id))
      or (topic_id is not null
        and public.is_chat_topic_member(topic_id))
    )
  );

drop policy if exists "chat_polls_insert" on public.chat_polls;
create policy "chat_polls_insert"
  on public.chat_polls for insert to authenticated
  with check (
    created_by = auth.uid()
    and (
      (conversation_id is not null
        and public.is_conversation_participant(conversation_id))
      or (topic_id is not null
        and public.is_chat_topic_member(topic_id))
    )
  );

drop policy if exists "chat_polls_update" on public.chat_polls;
create policy "chat_polls_update"
  on public.chat_polls for update to authenticated
  using (
    deleted_at is null
    and (
      (conversation_id is not null
        and public.is_conversation_participant(conversation_id))
      or (topic_id is not null
        and public.is_chat_topic_member(topic_id))
    )
  )
  with check (
    (
      (conversation_id is not null
        and public.is_conversation_participant(conversation_id))
      or (topic_id is not null
        and public.is_chat_topic_member(topic_id))
    )
  );

drop policy if exists "chat_poll_options_select" on public.chat_poll_options;
create policy "chat_poll_options_select"
  on public.chat_poll_options for select to authenticated
  using (
    deleted_at is null
    and public.can_access_chat_poll(poll_id)
  );

drop policy if exists "chat_poll_options_insert" on public.chat_poll_options;
create policy "chat_poll_options_insert"
  on public.chat_poll_options for insert to authenticated
  with check (
    created_by = auth.uid()
    and public.can_access_chat_poll(poll_id)
  );

drop policy if exists "chat_poll_votes_select" on public.chat_poll_votes;
create policy "chat_poll_votes_select"
  on public.chat_poll_votes for select to authenticated
  using (
    deleted_at is null
    and public.can_access_chat_poll(poll_id)
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
        and public.can_access_chat_poll(p.id)
    )
  );
