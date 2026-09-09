-- Switch Super Admin → operatore (non un altro Super Admin).
-- ISO 9001: sessione tracciata, soft-close (ended_at), nessun delete fisico.

create table if not exists public.impersonation_sessions (
  id uuid primary key default gen_random_uuid(),
  actor_user_id uuid not null references auth.users (id) on delete cascade,
  target_user_id uuid not null references auth.users (id) on delete cascade,
  started_at timestamptz not null default now(),
  ended_at timestamptz,
  ended_by uuid references auth.users (id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  created_by uuid references auth.users (id) on delete set null,
  updated_by uuid references auth.users (id) on delete set null,
  deleted_at timestamptz,
  deleted_by uuid references auth.users (id) on delete set null,
  constraint impersonation_sessions_distinct check (actor_user_id <> target_user_id)
);

create unique index if not exists impersonation_sessions_actor_active_uidx
  on public.impersonation_sessions (actor_user_id)
  where ended_at is null and deleted_at is null;

create index if not exists impersonation_sessions_target_idx
  on public.impersonation_sessions (target_user_id, started_at desc);

drop trigger if exists impersonation_sessions_updated_at on public.impersonation_sessions;
create trigger impersonation_sessions_updated_at
  before update on public.impersonation_sessions
  for each row execute function public.set_updated_at();

comment on table public.impersonation_sessions is
  'ISO: Super Admin opera come un operatore. Una sessione attiva per attore. Chiusura con ended_at.';

alter table public.impersonation_sessions enable row level security;

drop policy if exists "impersonation_sessions_own" on public.impersonation_sessions;
create policy "impersonation_sessions_own"
  on public.impersonation_sessions for select to authenticated
  using (actor_user_id = auth.uid() and deleted_at is null);

grant select on table public.impersonation_sessions to authenticated;
grant all on table public.impersonation_sessions to postgres, service_role;
revoke insert, update, delete on table public.impersonation_sessions from authenticated;

-- Identità effettiva: operatore impersonato, altrimenti login reale
create or replace function public.app_effective_uid()
returns uuid
language sql
stable
security definer
set search_path = public
as $$
  select coalesce(
    (
      select s.target_user_id
      from public.impersonation_sessions s
      where s.actor_user_id = auth.uid()
        and s.ended_at is null
        and s.deleted_at is null
      order by s.started_at desc
      limit 1
    ),
    auth.uid()
  );
$$;

comment on function public.app_effective_uid() is
  'UID con cui il gestionale valuta permessi: operatore in switch, altrimenti auth.uid().';

grant execute on function public.app_effective_uid() to authenticated;

create or replace function public.is_superadmin()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.profiles p
    join public.app_roles r on r.id = p.role_id
    where p.id = public.app_effective_uid()
      and r.code = 'superadmin'
      and p.is_active = true
  );
$$;

create or replace function public.is_admin()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.profiles p
    join public.app_roles r on r.id = p.role_id
    where p.id = public.app_effective_uid()
      and r.code in ('admin', 'superadmin')
      and p.is_active = true
  );
$$;

create or replace function public.has_area_access(p_slug text)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.get_user_areas(public.app_effective_uid()) a
    where a.slug = p_slug
  );
$$;

create or replace function public.can_access_webmail_account(p_account_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select
    public.is_superadmin()
    or public.has_area_access('amministrazione')
    or exists (
      select 1
      from public.webmail_account_grants g
      where g.account_id = p_account_id
        and g.user_id = public.app_effective_uid()
        and g.deleted_at is null
    );
$$;

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
      and (
        c.customer_id = public.app_effective_uid()
        or c.producer_id = public.app_effective_uid()
      )
  );
$$;

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
      and m.user_id = public.app_effective_uid()
      and m.deleted_at is null
      and t.deleted_at is null
  );
$$;

-- Contatti / conversazioni: stesse regole dell’operatore impersonato
drop policy if exists "chat_contacts_own" on public.chat_contacts;
create policy "chat_contacts_own"
  on public.chat_contacts for all to authenticated
  using (owner_id = public.app_effective_uid())
  with check (owner_id = public.app_effective_uid());

drop policy if exists "conversations_select" on public.conversations;
create policy "conversations_select"
  on public.conversations for select to authenticated
  using (
    deleted_at is null
    and (
      customer_id = public.app_effective_uid()
      or producer_id = public.app_effective_uid()
    )
  );

drop policy if exists "webmail_account_grants_select" on public.webmail_account_grants;
create policy "webmail_account_grants_select"
  on public.webmail_account_grants for select to authenticated
  using (
    public.is_superadmin()
    or public.has_area_access('amministrazione')
    or user_id = public.app_effective_uid()
  );
