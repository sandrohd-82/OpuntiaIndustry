-- Chat interna utente↔utente (Supabase Realtime, NO MQTT, NO AI)
-- ISO 9001: audit su report/blocchi; soft delete dove operativo

-- ---------------------------------------------------------------------------
-- Profiles: disponibilità chat + ban rubrica
-- ---------------------------------------------------------------------------
alter table public.profiles
  add column if not exists chat_status text not null default 'available'
    check (chat_status in ('available', 'away', 'offline')),
  add column if not exists chat_rubrica_banned_at timestamptz;

comment on column public.profiles.chat_status is
  'Disponibilità chat: available | away | offline';
comment on column public.profiles.chat_rubrica_banned_at is
  'Se valorizzato, il profilo non può essere contattato da rubrica producer→customer';

-- Token FCM opzionali (push side-channel)
create table if not exists public.chat_fcm_tokens (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  token text not null,
  platform text not null default 'web',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (user_id, token)
);

create index if not exists chat_fcm_tokens_user_idx on public.chat_fcm_tokens (user_id);

drop trigger if exists chat_fcm_tokens_updated_at on public.chat_fcm_tokens;
create trigger chat_fcm_tokens_updated_at
  before update on public.chat_fcm_tokens
  for each row execute function public.set_updated_at();

alter table public.chat_fcm_tokens enable row level security;
drop policy if exists "chat_fcm_tokens_own" on public.chat_fcm_tokens;
create policy "chat_fcm_tokens_own"
  on public.chat_fcm_tokens for all to authenticated
  using (user_id = auth.uid())
  with check (user_id = auth.uid());
grant select, insert, update, delete on table public.chat_fcm_tokens to authenticated;
grant all on table public.chat_fcm_tokens to postgres, service_role;

-- ---------------------------------------------------------------------------
-- chat_contacts (prima di conversations policies)
-- ---------------------------------------------------------------------------
create table if not exists public.chat_contacts (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references auth.users (id) on delete cascade,
  peer_id uuid not null references auth.users (id) on delete cascade,
  peer_kind text not null check (peer_kind in ('customer', 'producer')),
  last_interaction_at timestamptz not null default now(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint chat_contacts_distinct check (owner_id <> peer_id),
  unique (owner_id, peer_id)
);

create index if not exists chat_contacts_owner_idx
  on public.chat_contacts (owner_id, last_interaction_at desc);

drop trigger if exists chat_contacts_updated_at on public.chat_contacts;
create trigger chat_contacts_updated_at
  before update on public.chat_contacts
  for each row execute function public.set_updated_at();

alter table public.chat_contacts enable row level security;
drop policy if exists "chat_contacts_own" on public.chat_contacts;
create policy "chat_contacts_own"
  on public.chat_contacts for all to authenticated
  using (owner_id = auth.uid())
  with check (owner_id = auth.uid());
grant select, insert, update, delete on table public.chat_contacts to authenticated;
grant all on table public.chat_contacts to postgres, service_role;

-- ---------------------------------------------------------------------------
-- chat_blocks
-- ---------------------------------------------------------------------------
create table if not exists public.chat_blocks (
  id uuid primary key default gen_random_uuid(),
  blocker_id uuid not null references auth.users (id) on delete cascade,
  blocked_id uuid not null references auth.users (id) on delete cascade,
  created_at timestamptz not null default now(),
  created_by uuid references auth.users (id) on delete set null,
  constraint chat_blocks_distinct check (blocker_id <> blocked_id),
  unique (blocker_id, blocked_id)
);

create index if not exists chat_blocks_blocker_idx on public.chat_blocks (blocker_id);
create index if not exists chat_blocks_blocked_idx on public.chat_blocks (blocked_id);

alter table public.chat_blocks enable row level security;
drop policy if exists "chat_blocks_select" on public.chat_blocks;
create policy "chat_blocks_select"
  on public.chat_blocks for select to authenticated
  using (blocker_id = auth.uid() or blocked_id = auth.uid());
drop policy if exists "chat_blocks_insert" on public.chat_blocks;
create policy "chat_blocks_insert"
  on public.chat_blocks for insert to authenticated
  with check (blocker_id = auth.uid() and created_by = auth.uid());
drop policy if exists "chat_blocks_delete" on public.chat_blocks;
create policy "chat_blocks_delete"
  on public.chat_blocks for delete to authenticated
  using (blocker_id = auth.uid());
grant select, insert, delete on table public.chat_blocks to authenticated;
grant all on table public.chat_blocks to postgres, service_role;

-- ---------------------------------------------------------------------------
-- conversations
-- ---------------------------------------------------------------------------
create table if not exists public.conversations (
  id uuid primary key default gen_random_uuid(),
  customer_id uuid not null references auth.users (id) on delete cascade,
  producer_id uuid not null references auth.users (id) on delete cascade,
  listing_id uuid,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz,
  deleted_by uuid references auth.users (id) on delete set null,
  constraint conversations_distinct_peers check (customer_id <> producer_id)
);

create unique index if not exists conversations_pair_no_listing_uidx
  on public.conversations (customer_id, producer_id)
  where listing_id is null and deleted_at is null;

create unique index if not exists conversations_pair_listing_uidx
  on public.conversations (customer_id, producer_id, listing_id)
  where listing_id is not null and deleted_at is null;

create index if not exists conversations_customer_idx
  on public.conversations (customer_id) where deleted_at is null;
create index if not exists conversations_producer_idx
  on public.conversations (producer_id) where deleted_at is null;
create index if not exists conversations_updated_idx
  on public.conversations (updated_at desc) where deleted_at is null;

comment on table public.conversations is
  'Chat utente↔utente (customer/producer pair). listing_id opzionale (marketplace futuro).';
comment on column public.conversations.listing_id is
  'Opzionale: id listing esterno; nessun FK finché shop_listings non esiste.';

drop trigger if exists conversations_updated_at on public.conversations;
create trigger conversations_updated_at
  before update on public.conversations
  for each row execute function public.set_updated_at();

create or replace function public.is_conversation_participant(p_conversation_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1 from public.conversations c
    where c.id = p_conversation_id
      and c.deleted_at is null
      and (c.customer_id = auth.uid() or c.producer_id = auth.uid())
  );
$$;

grant execute on function public.is_conversation_participant(uuid) to authenticated;

alter table public.conversations enable row level security;

drop policy if exists "conversations_select" on public.conversations;
create policy "conversations_select"
  on public.conversations for select to authenticated
  using (
    deleted_at is null
    and (customer_id = auth.uid() or producer_id = auth.uid())
  );

drop policy if exists "conversations_insert" on public.conversations;
create policy "conversations_insert"
  on public.conversations for insert to authenticated
  with check (
    customer_id = auth.uid()
    or (
      producer_id = auth.uid()
      and exists (
        select 1 from public.chat_contacts cc
        where cc.owner_id = auth.uid()
          and cc.peer_id = conversations.customer_id
      )
      and not exists (
        select 1 from public.profiles p
        where p.id = conversations.customer_id
          and p.chat_rubrica_banned_at is not null
      )
    )
  );

drop policy if exists "conversations_update" on public.conversations;
create policy "conversations_update"
  on public.conversations for update to authenticated
  using (customer_id = auth.uid() or producer_id = auth.uid())
  with check (customer_id = auth.uid() or producer_id = auth.uid());

grant select, insert, update on table public.conversations to authenticated;
grant all on table public.conversations to postgres, service_role;
revoke delete on table public.conversations from authenticated;

-- ---------------------------------------------------------------------------
-- messages
-- ---------------------------------------------------------------------------
create table if not exists public.messages (
  id uuid primary key default gen_random_uuid(),
  conversation_id uuid not null references public.conversations (id) on delete cascade,
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

create index if not exists messages_conversation_created_idx
  on public.messages (conversation_id, created_at asc)
  where deleted_at is null;
create index if not exists messages_unread_idx
  on public.messages (conversation_id, sender_id)
  where deleted_at is null and is_read = false;

alter table public.messages replica identity full;

alter table public.messages enable row level security;

drop policy if exists "messages_select" on public.messages;
create policy "messages_select"
  on public.messages for select to authenticated
  using (
    deleted_at is null
    and public.is_conversation_participant(conversation_id)
  );

drop policy if exists "messages_insert" on public.messages;
create policy "messages_insert"
  on public.messages for insert to authenticated
  with check (
    sender_id = auth.uid()
    and public.is_conversation_participant(conversation_id)
  );

drop policy if exists "messages_update" on public.messages;
create policy "messages_update"
  on public.messages for update to authenticated
  using (
    public.is_conversation_participant(conversation_id)
    and sender_id <> auth.uid()
  )
  with check (
    public.is_conversation_participant(conversation_id)
    and sender_id <> auth.uid()
  );

grant select, insert, update on table public.messages to authenticated;
grant all on table public.messages to postgres, service_role;
revoke delete on table public.messages from authenticated;

-- ---------------------------------------------------------------------------
-- chat_reports
-- ---------------------------------------------------------------------------
create table if not exists public.chat_reports (
  id uuid primary key default gen_random_uuid(),
  reporter_id uuid not null references auth.users (id) on delete cascade,
  reported_id uuid not null references auth.users (id) on delete cascade,
  conversation_id uuid references public.conversations (id) on delete set null,
  transcript jsonb not null default '[]'::jsonb,
  reason text not null default '',
  status text not null default 'aperto'
    check (status in ('aperto', 'in_revisione', 'chiuso', 'archiviato')),
  versione integer not null default 1,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  created_by uuid references auth.users (id) on delete set null,
  updated_by uuid references auth.users (id) on delete set null,
  deleted_at timestamptz,
  deleted_by uuid references auth.users (id) on delete set null
);

drop trigger if exists chat_reports_updated_at on public.chat_reports;
create trigger chat_reports_updated_at
  before update on public.chat_reports
  for each row execute function public.set_updated_at();

alter table public.chat_reports enable row level security;
drop policy if exists "chat_reports_insert" on public.chat_reports;
create policy "chat_reports_insert"
  on public.chat_reports for insert to authenticated
  with check (reporter_id = auth.uid() and created_by = auth.uid());
drop policy if exists "chat_reports_select" on public.chat_reports;
create policy "chat_reports_select"
  on public.chat_reports for select to authenticated
  using (
    reporter_id = auth.uid()
    or public.is_superadmin()
    or public.has_area_access('amministrazione')
  );
drop policy if exists "chat_reports_update_admin" on public.chat_reports;
create policy "chat_reports_update_admin"
  on public.chat_reports for update to authenticated
  using (public.is_superadmin() or public.has_area_access('amministrazione'))
  with check (public.is_superadmin() or public.has_area_access('amministrazione'));
grant select, insert, update on table public.chat_reports to authenticated;
grant all on table public.chat_reports to postgres, service_role;

-- ---------------------------------------------------------------------------
-- Helpers: blocked pair
-- ---------------------------------------------------------------------------
create or replace function public.chat_pair_is_blocked(a uuid, b uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1 from public.chat_blocks bl
    where (bl.blocker_id = a and bl.blocked_id = b)
       or (bl.blocker_id = b and bl.blocked_id = a)
  );
$$;

grant execute on function public.chat_pair_is_blocked(uuid, uuid) to authenticated;

-- ---------------------------------------------------------------------------
-- Trigger: enforce block + touch conversation + upsert contacts
-- ---------------------------------------------------------------------------
create or replace function public.trg_messages_before_insert()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_customer uuid;
  v_producer uuid;
  v_peer uuid;
begin
  select c.customer_id, c.producer_id into v_customer, v_producer
  from public.conversations c
  where c.id = new.conversation_id and c.deleted_at is null;

  if v_customer is null then
    raise exception 'conversation_not_found' using errcode = 'P0001';
  end if;

  if public.chat_pair_is_blocked(v_customer, v_producer) then
    raise exception 'chat_blocked' using errcode = 'P0001';
  end if;

  if new.sender_id is distinct from v_customer
     and new.sender_id is distinct from v_producer then
    raise exception 'not_participant' using errcode = 'P0001';
  end if;

  if new.status = 'read' then
    new.is_read := true;
  end if;

  return new;
end;
$$;

drop trigger if exists messages_before_insert on public.messages;
create trigger messages_before_insert
  before insert on public.messages
  for each row execute function public.trg_messages_before_insert();

create or replace function public.trg_messages_after_insert()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_customer uuid;
  v_producer uuid;
begin
  select c.customer_id, c.producer_id into v_customer, v_producer
  from public.conversations c where c.id = new.conversation_id;

  update public.conversations
  set updated_at = now()
  where id = new.conversation_id;

  -- contacts: entrambi i lati
  insert into public.chat_contacts (owner_id, peer_id, peer_kind, last_interaction_at)
  values (v_customer, v_producer, 'producer', now())
  on conflict (owner_id, peer_id) do update
    set last_interaction_at = excluded.last_interaction_at,
        peer_kind = excluded.peer_kind,
        updated_at = now();

  insert into public.chat_contacts (owner_id, peer_id, peer_kind, last_interaction_at)
  values (v_producer, v_customer, 'customer', now())
  on conflict (owner_id, peer_id) do update
    set last_interaction_at = excluded.last_interaction_at,
        peer_kind = excluded.peer_kind,
        updated_at = now();

  return new;
end;
$$;

drop trigger if exists messages_after_insert on public.messages;
create trigger messages_after_insert
  after insert on public.messages
  for each row execute function public.trg_messages_after_insert();

create or replace function public.trg_messages_before_update_status()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if new.status = 'read' then
    new.is_read := true;
  elsif new.is_read = true and new.status = 'sent' then
    new.status := 'read';
  elsif new.is_read = true and new.status = 'delivered' then
    new.status := 'read';
  end if;
  return new;
end;
$$;

drop trigger if exists messages_before_update_status on public.messages;
create trigger messages_before_update_status
  before update of status, is_read on public.messages
  for each row execute function public.trg_messages_before_update_status();

-- ---------------------------------------------------------------------------
-- RPC
-- ---------------------------------------------------------------------------
create or replace function public.mark_messages_delivered(message_ids uuid[])
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  n integer;
begin
  update public.messages m
  set status = 'delivered'
  from public.conversations c
  where m.id = any (message_ids)
    and m.conversation_id = c.id
    and m.deleted_at is null
    and m.sender_id <> auth.uid()
    and (c.customer_id = auth.uid() or c.producer_id = auth.uid())
    and m.status = 'sent';
  get diagnostics n = row_count;
  return n;
end;
$$;

grant execute on function public.mark_messages_delivered(uuid[]) to authenticated;

create or replace function public.mark_messages_read(p_conversation_id uuid)
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  n integer;
begin
  if not public.is_conversation_participant(p_conversation_id) then
    raise exception 'not_participant' using errcode = 'P0001';
  end if;

  update public.messages m
  set status = 'read', is_read = true
  where m.conversation_id = p_conversation_id
    and m.deleted_at is null
    and m.sender_id <> auth.uid()
    and (m.is_read = false or m.status in ('sent', 'delivered'));
  get diagnostics n = row_count;
  return n;
end;
$$;

grant execute on function public.mark_messages_read(uuid) to authenticated;

create or replace function public.mark_messages_read_by_ids(message_ids uuid[])
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  n integer;
begin
  update public.messages m
  set status = 'read', is_read = true
  from public.conversations c
  where m.id = any (message_ids)
    and m.conversation_id = c.id
    and m.deleted_at is null
    and m.sender_id <> auth.uid()
    and (c.customer_id = auth.uid() or c.producer_id = auth.uid());
  get diagnostics n = row_count;
  return n;
end;
$$;

grant execute on function public.mark_messages_read_by_ids(uuid[]) to authenticated;

create or replace function public.ensure_chat_conversation_with_peer(p_peer_id uuid)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_me uuid := auth.uid();
  v_id uuid;
  v_customer uuid;
  v_producer uuid;
  v_peer_banned boolean;
begin
  if v_me is null then
    raise exception 'not_authenticated' using errcode = 'P0001';
  end if;
  if p_peer_id is null or p_peer_id = v_me then
    raise exception 'invalid_peer' using errcode = 'P0001';
  end if;
  if public.chat_pair_is_blocked(v_me, p_peer_id) then
    raise exception 'chat_blocked' using errcode = 'P0001';
  end if;

  select chat_rubrica_banned_at is not null into v_peer_banned
  from public.profiles where id = p_peer_id;
  if coalesce(v_peer_banned, false) then
    -- se io sono producer e peer banned da rubrica: solo se già in contacts
    if not exists (
      select 1 from public.chat_contacts
      where owner_id = v_me and peer_id = p_peer_id
    ) then
      raise exception 'peer_rubrica_banned' using errcode = 'P0001';
    end if;
  end if;

  -- pair legacy: customer = minore uuid, producer = maggiore (stabile) OPPURE
  -- initiator as customer se nuovo. Preferiamo: existing pair either orientation.
  select c.id into v_id
  from public.conversations c
  where c.deleted_at is null
    and c.listing_id is null
    and (
      (c.customer_id = v_me and c.producer_id = p_peer_id)
      or (c.customer_id = p_peer_id and c.producer_id = v_me)
    )
  limit 1;

  if v_id is not null then
    return v_id;
  end if;

  -- Nuova: caller = customer, peer = producer (default buyer→producer)
  -- Se caller è già in contacts come producer verso peer customer, inverti
  if exists (
    select 1 from public.chat_contacts
    where owner_id = v_me and peer_id = p_peer_id and peer_kind = 'customer'
  ) then
    v_customer := p_peer_id;
    v_producer := v_me;
  else
    v_customer := v_me;
    v_producer := p_peer_id;
  end if;

  insert into public.conversations (customer_id, producer_id, listing_id)
  values (v_customer, v_producer, null)
  returning id into v_id;

  return v_id;
end;
$$;

grant execute on function public.ensure_chat_conversation_with_peer(uuid) to authenticated;

create or replace function public.delete_chat_message(p_message_id uuid)
returns boolean
language plpgsql
security definer
set search_path = public
as $$
begin
  update public.messages
  set deleted_at = now(), deleted_by = auth.uid()
  where id = p_message_id
    and sender_id = auth.uid()
    and deleted_at is null;
  return found;
end;
$$;

grant execute on function public.delete_chat_message(uuid) to authenticated;

create or replace function public.purge_inactive_chats(p_days integer default 7)
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  n integer;
begin
  -- solo service_role (auth.uid() null tipico) o superadmin
  if auth.uid() is not null and not public.is_superadmin() then
    raise exception 'forbidden' using errcode = '42501';
  end if;

  update public.conversations c
  set deleted_at = now()
  where c.deleted_at is null
    and c.updated_at < now() - make_interval(days => greatest(p_days, 1));
  get diagnostics n = row_count;
  return n;
end;
$$;

grant execute on function public.purge_inactive_chats(integer) to service_role;

create or replace function public.purge_expired_listing_chats()
returns integer
language plpgsql
security definer
set search_path = public
as $$
begin
  -- No-op finché non esiste shop_listings; riservato service_role
  if auth.uid() is not null and not public.is_superadmin() then
    raise exception 'forbidden' using errcode = '42501';
  end if;
  return 0;
end;
$$;

grant execute on function public.purge_expired_listing_chats() to service_role;

create or replace function public.lazy_cleanup_chats()
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  perform public.purge_expired_listing_chats();
  -- inactive purge non automatico dal client (troppo aggressivo); solo listing
end;
$$;

grant execute on function public.lazy_cleanup_chats() to authenticated, service_role;

create or replace function public.chat_unread_count(p_user_id uuid default auth.uid())
returns integer
language sql
stable
security definer
set search_path = public
as $$
  select coalesce(count(*)::integer, 0)
  from public.messages m
  join public.conversations c on c.id = m.conversation_id
  where m.deleted_at is null
    and c.deleted_at is null
    and m.sender_id <> p_user_id
    and m.is_read = false
    and (c.customer_id = p_user_id or c.producer_id = p_user_id)
    and p_user_id = auth.uid();
$$;

grant execute on function public.chat_unread_count(uuid) to authenticated;

-- ---------------------------------------------------------------------------
-- Realtime publication
-- ---------------------------------------------------------------------------
do $$
begin
  alter publication supabase_realtime add table public.messages;
exception
  when duplicate_object then null;
  when undefined_object then null;
end $$;

do $$
begin
  alter publication supabase_realtime add table public.conversations;
exception
  when duplicate_object then null;
  when undefined_object then null;
end $$;

-- ---------------------------------------------------------------------------
-- Storage: voice_notes + chat_media
-- ---------------------------------------------------------------------------
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'voice_notes',
  'voice_notes',
  true,
  5242880,
  array[
    'audio/webm', 'audio/ogg', 'audio/mp4', 'audio/mpeg',
    'audio/aac', 'audio/x-m4a', 'audio/wav', 'audio/wave'
  ]::text[]
)
on conflict (id) do update set
  public = excluded.public,
  file_size_limit = excluded.file_size_limit,
  allowed_mime_types = excluded.allowed_mime_types;

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'chat_media',
  'chat_media',
  true,
  10485760,
  array[
    'image/jpeg', 'image/png', 'image/webp', 'image/gif',
    'application/pdf',
    'application/msword',
    'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    'text/plain'
  ]::text[]
)
on conflict (id) do update set
  public = excluded.public,
  file_size_limit = excluded.file_size_limit,
  allowed_mime_types = excluded.allowed_mime_types;

-- Storage policies: path {userId}/{conversationId}/filename
drop policy if exists "voice_notes_select" on storage.objects;
create policy "voice_notes_select"
  on storage.objects for select to authenticated, anon
  using (bucket_id = 'voice_notes');

drop policy if exists "voice_notes_insert" on storage.objects;
create policy "voice_notes_insert"
  on storage.objects for insert to authenticated
  with check (
    bucket_id = 'voice_notes'
    and (storage.foldername(name))[1] = auth.uid()::text
    and public.is_conversation_participant(((storage.foldername(name))[2])::uuid)
  );

drop policy if exists "voice_notes_delete" on storage.objects;
create policy "voice_notes_delete"
  on storage.objects for delete to authenticated
  using (
    bucket_id = 'voice_notes'
    and (
      (storage.foldername(name))[1] = auth.uid()::text
      or public.is_superadmin()
    )
  );

drop policy if exists "chat_media_select" on storage.objects;
create policy "chat_media_select"
  on storage.objects for select to authenticated, anon
  using (bucket_id = 'chat_media');

drop policy if exists "chat_media_insert" on storage.objects;
create policy "chat_media_insert"
  on storage.objects for insert to authenticated
  with check (
    bucket_id = 'chat_media'
    and (storage.foldername(name))[1] = auth.uid()::text
    and public.is_conversation_participant(((storage.foldername(name))[2])::uuid)
  );

drop policy if exists "chat_media_delete" on storage.objects;
create policy "chat_media_delete"
  on storage.objects for delete to authenticated
  using (
    bucket_id = 'chat_media'
    and (
      (storage.foldername(name))[1] = auth.uid()::text
      or public.is_superadmin()
    )
  );

-- Lettura profili colleghi (rubrica / inbox chat) — OR con policy esistenti
drop policy if exists "profiles_select_active_peers" on public.profiles;
create policy "profiles_select_active_peers"
  on public.profiles for select to authenticated
  using (is_active = true);
