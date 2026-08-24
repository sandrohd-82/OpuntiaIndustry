-- Chat Opzione A: argomenti (topic di gruppo) + messaggi topic
-- Separati dalle chat 1:1 (conversations/messages)

-- ---------------------------------------------------------------------------
-- chat_topics
-- ---------------------------------------------------------------------------
create table if not exists public.chat_topics (
  id uuid primary key default gen_random_uuid(),
  titolo text not null,
  stato text not null default 'attivo'
    check (stato in ('attivo', 'archiviato')),
  created_by uuid references auth.users (id) on delete set null,
  updated_by uuid references auth.users (id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz,
  deleted_by uuid references auth.users (id) on delete set null,
  constraint chat_topics_titolo_len check (
    char_length(titolo) >= 1 and char_length(titolo) <= 100
  )
);

create index if not exists chat_topics_attivo_idx
  on public.chat_topics (updated_at desc)
  where deleted_at is null and stato = 'attivo';

comment on table public.chat_topics is
  'Argomenti chat di gruppo (ISO 9001). Visibili solo ai membri.';

drop trigger if exists chat_topics_updated_at on public.chat_topics;
create trigger chat_topics_updated_at
  before update on public.chat_topics
  for each row execute function public.set_updated_at();

-- ---------------------------------------------------------------------------
-- chat_topic_members
-- ---------------------------------------------------------------------------
create table if not exists public.chat_topic_members (
  id uuid primary key default gen_random_uuid(),
  topic_id uuid not null references public.chat_topics (id) on delete cascade,
  user_id uuid not null references auth.users (id) on delete cascade,
  ruolo text not null default 'member'
    check (ruolo in ('owner', 'member')),
  created_by uuid references auth.users (id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz,
  deleted_by uuid references auth.users (id) on delete set null
);

create unique index if not exists chat_topic_members_open_uidx
  on public.chat_topic_members (topic_id, user_id)
  where deleted_at is null;

create index if not exists chat_topic_members_user_idx
  on public.chat_topic_members (user_id)
  where deleted_at is null;

drop trigger if exists chat_topic_members_updated_at on public.chat_topic_members;
create trigger chat_topic_members_updated_at
  before update on public.chat_topic_members
  for each row execute function public.set_updated_at();

create or replace function public.is_chat_topic_member(p_topic_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.chat_topic_members m
    join public.chat_topics t on t.id = m.topic_id
    where m.topic_id = p_topic_id
      and m.user_id = auth.uid()
      and m.deleted_at is null
      and t.deleted_at is null
  );
$$;

grant execute on function public.is_chat_topic_member(uuid) to authenticated;

alter table public.chat_topics enable row level security;
drop policy if exists "chat_topics_select" on public.chat_topics;
create policy "chat_topics_select"
  on public.chat_topics for select to authenticated
  using (
    deleted_at is null
    and public.is_chat_topic_member(id)
  );

drop policy if exists "chat_topics_insert" on public.chat_topics;
create policy "chat_topics_insert"
  on public.chat_topics for insert to authenticated
  with check (created_by = auth.uid());

drop policy if exists "chat_topics_update" on public.chat_topics;
create policy "chat_topics_update"
  on public.chat_topics for update to authenticated
  using (public.is_chat_topic_member(id))
  with check (public.is_chat_topic_member(id));

grant select, insert, update on table public.chat_topics to authenticated;
grant all on table public.chat_topics to postgres, service_role;
revoke delete on table public.chat_topics from authenticated;

alter table public.chat_topic_members enable row level security;
drop policy if exists "chat_topic_members_select" on public.chat_topic_members;
create policy "chat_topic_members_select"
  on public.chat_topic_members for select to authenticated
  using (
    deleted_at is null
    and (
      user_id = auth.uid()
      or public.is_chat_topic_member(topic_id)
    )
  );

drop policy if exists "chat_topic_members_insert" on public.chat_topic_members;
create policy "chat_topic_members_insert"
  on public.chat_topic_members for insert to authenticated
  with check (
    created_by = auth.uid()
    and (
      user_id = auth.uid()
      or public.is_chat_topic_member(topic_id)
    )
  );

drop policy if exists "chat_topic_members_update" on public.chat_topic_members;
create policy "chat_topic_members_update"
  on public.chat_topic_members for update to authenticated
  using (public.is_chat_topic_member(topic_id))
  with check (public.is_chat_topic_member(topic_id));

grant select, insert, update on table public.chat_topic_members to authenticated;
grant all on table public.chat_topic_members to postgres, service_role;
revoke delete on table public.chat_topic_members from authenticated;

-- ---------------------------------------------------------------------------
-- chat_topic_messages
-- ---------------------------------------------------------------------------
create table if not exists public.chat_topic_messages (
  id uuid primary key default gen_random_uuid(),
  topic_id uuid not null references public.chat_topics (id) on delete cascade,
  sender_id uuid not null references auth.users (id) on delete cascade,
  content text not null default '',
  created_at timestamptz not null default now(),
  is_read boolean not null default false,
  status text not null default 'sent'
    check (status in ('sent', 'delivered', 'read')),
  audio_url text,
  file_url text,
  file_type text,
  file_name text,
  deleted_at timestamptz,
  deleted_by uuid references auth.users (id) on delete set null
);

create index if not exists chat_topic_messages_topic_idx
  on public.chat_topic_messages (topic_id, created_at asc)
  where deleted_at is null;

alter table public.chat_topic_messages replica identity full;

alter table public.chat_topic_messages enable row level security;

drop policy if exists "chat_topic_messages_select" on public.chat_topic_messages;
create policy "chat_topic_messages_select"
  on public.chat_topic_messages for select to authenticated
  using (
    deleted_at is null
    and public.is_chat_topic_member(topic_id)
  );

drop policy if exists "chat_topic_messages_insert" on public.chat_topic_messages;
create policy "chat_topic_messages_insert"
  on public.chat_topic_messages for insert to authenticated
  with check (
    sender_id = auth.uid()
    and public.is_chat_topic_member(topic_id)
  );

drop policy if exists "chat_topic_messages_update" on public.chat_topic_messages;
create policy "chat_topic_messages_update"
  on public.chat_topic_messages for update to authenticated
  using (
    public.is_chat_topic_member(topic_id)
    and sender_id <> auth.uid()
  )
  with check (
    public.is_chat_topic_member(topic_id)
    and sender_id <> auth.uid()
  );

grant select, insert, update on table public.chat_topic_messages to authenticated;
grant all on table public.chat_topic_messages to postgres, service_role;
revoke delete on table public.chat_topic_messages from authenticated;

create or replace function public.trg_chat_topic_messages_after_insert()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  update public.chat_topics
  set updated_at = now(), updated_by = new.sender_id
  where id = new.topic_id;
  return new;
end;
$$;

drop trigger if exists chat_topic_messages_after_insert on public.chat_topic_messages;
create trigger chat_topic_messages_after_insert
  after insert on public.chat_topic_messages
  for each row execute function public.trg_chat_topic_messages_after_insert();

-- ---------------------------------------------------------------------------
-- RPC: crea argomento + membri (creator sempre owner)
-- ---------------------------------------------------------------------------
create or replace function public.create_chat_topic(
  p_titolo text,
  p_member_ids uuid[]
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_me uuid := auth.uid();
  v_id uuid;
  v_titolo text := trim(p_titolo);
  v_uid uuid;
begin
  if v_me is null then
    raise exception 'not_authenticated' using errcode = 'P0001';
  end if;
  if v_titolo is null or char_length(v_titolo) < 1 or char_length(v_titolo) > 100 then
    raise exception 'titolo_invalido' using errcode = 'P0001';
  end if;

  insert into public.chat_topics (titolo, stato, created_by, updated_by)
  values (v_titolo, 'attivo', v_me, v_me)
  returning id into v_id;

  insert into public.chat_topic_members (topic_id, user_id, ruolo, created_by)
  values (v_id, v_me, 'owner', v_me);

  if p_member_ids is not null then
    foreach v_uid in array p_member_ids loop
      if v_uid is distinct from v_me
         and not exists (
           select 1 from public.chat_topic_members m
           where m.topic_id = v_id and m.user_id = v_uid and m.deleted_at is null
         ) then
        insert into public.chat_topic_members (topic_id, user_id, ruolo, created_by)
        values (v_id, v_uid, 'member', v_me);
      end if;
    end loop;
  end if;

  return v_id;
end;
$$;

grant execute on function public.create_chat_topic(text, uuid[]) to authenticated;

create or replace function public.mark_topic_messages_read(p_topic_id uuid)
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  n integer;
begin
  if not public.is_chat_topic_member(p_topic_id) then
    raise exception 'not_participant' using errcode = 'P0001';
  end if;
  update public.chat_topic_messages
  set status = 'read', is_read = true
  where topic_id = p_topic_id
    and deleted_at is null
    and sender_id <> auth.uid()
    and (is_read = false or status in ('sent', 'delivered'));
  get diagnostics n = row_count;
  return n;
end;
$$;

grant execute on function public.mark_topic_messages_read(uuid) to authenticated;

create or replace function public.delete_chat_topic_message(p_message_id uuid)
returns boolean
language plpgsql
security definer
set search_path = public
as $$
begin
  update public.chat_topic_messages
  set deleted_at = now(), deleted_by = auth.uid()
  where id = p_message_id
    and sender_id = auth.uid()
    and deleted_at is null;
  return found;
end;
$$;

grant execute on function public.delete_chat_topic_message(uuid) to authenticated;

do $$
begin
  alter publication supabase_realtime add table public.chat_topic_messages;
exception
  when duplicate_object then null;
  when undefined_object then null;
end $$;

do $$
begin
  alter publication supabase_realtime add table public.chat_topics;
exception
  when duplicate_object then null;
  when undefined_object then null;
end $$;
