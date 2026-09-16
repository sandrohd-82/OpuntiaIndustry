-- Inbox notifiche gestionale + sottoscrizioni Web Push (Windows / macOS / PWA).
-- Tipi distinti: attivita, webmail, sistema, chat, scadenza.
-- ISO 9001: audit, soft delete, RLS per destinatario, chi/quando.

create table if not exists public.app_notifiche (
  id uuid primary key default gen_random_uuid(),
  recipient_id uuid not null references auth.users (id) on delete cascade,
  actor_id uuid references auth.users (id) on delete set null,
  tipo text not null
    check (tipo in ('attivita', 'webmail', 'sistema', 'chat', 'scadenza')),
  title text not null,
  body text not null default '',
  href text not null default '/app/dashboard',
  entity_type text,
  entity_id uuid,
  payload jsonb not null default '{}'::jsonb,
  read_at timestamptz,
  read_by uuid references auth.users (id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  created_by uuid references auth.users (id) on delete set null,
  updated_by uuid references auth.users (id) on delete set null,
  deleted_at timestamptz,
  deleted_by uuid references auth.users (id) on delete set null,
  constraint app_notifiche_title_len check (char_length(trim(title)) between 1 and 180),
  constraint app_notifiche_body_len check (char_length(body) <= 2000),
  constraint app_notifiche_href_ok check (href like '/%')
);

create unique index if not exists app_notifiche_unread_entity_uidx
  on public.app_notifiche (recipient_id, tipo, entity_id)
  where deleted_at is null and read_at is null and entity_id is not null;

create index if not exists app_notifiche_recipient_unread_idx
  on public.app_notifiche (recipient_id, tipo)
  where deleted_at is null and read_at is null;

create index if not exists app_notifiche_recipient_idx
  on public.app_notifiche (recipient_id, created_at desc)
  where deleted_at is null;

drop trigger if exists app_notifiche_updated_at on public.app_notifiche;
create trigger app_notifiche_updated_at
  before update on public.app_notifiche
  for each row execute function public.set_updated_at();

comment on table public.app_notifiche is
  'Inbox notifiche per tipo (attivita/webmail/sistema/chat/scadenza). Soft delete, letto con read_at.';

alter table public.app_notifiche enable row level security;

drop policy if exists "app_notifiche_select_own" on public.app_notifiche;
create policy "app_notifiche_select_own"
  on public.app_notifiche for select to authenticated
  using (
    deleted_at is null
    and (
      recipient_id = public.app_effective_uid()
      or recipient_id = auth.uid()
    )
  );

drop policy if exists "app_notifiche_update_own" on public.app_notifiche;
create policy "app_notifiche_update_own"
  on public.app_notifiche for update to authenticated
  using (
    recipient_id = public.app_effective_uid()
    or recipient_id = auth.uid()
  )
  with check (
    recipient_id = public.app_effective_uid()
    or recipient_id = auth.uid()
  );

grant select, update on public.app_notifiche to authenticated;
grant all on public.app_notifiche to postgres, service_role;
revoke insert, delete on public.app_notifiche from authenticated;

-- Sottoscrizioni Web Push del browser (dispositivo reale = auth.uid, non switch).
create table if not exists public.app_push_subscriptions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  endpoint text not null,
  p256dh text not null,
  auth text not null,
  user_agent text,
  platform text not null default 'web',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  created_by uuid references auth.users (id) on delete set null,
  updated_by uuid references auth.users (id) on delete set null,
  deleted_at timestamptz,
  deleted_by uuid references auth.users (id) on delete set null
);

create unique index if not exists app_push_subscriptions_endpoint_uidx
  on public.app_push_subscriptions (endpoint)
  where deleted_at is null;

create index if not exists app_push_subscriptions_user_idx
  on public.app_push_subscriptions (user_id)
  where deleted_at is null;

drop trigger if exists app_push_subscriptions_updated_at
  on public.app_push_subscriptions;
create trigger app_push_subscriptions_updated_at
  before update on public.app_push_subscriptions
  for each row execute function public.set_updated_at();

comment on table public.app_push_subscriptions is
  'Endpoint Web Push (Chrome/Edge/Safari). Soft delete se il browser revoca.';

alter table public.app_push_subscriptions enable row level security;

drop policy if exists "app_push_subscriptions_own" on public.app_push_subscriptions;
create policy "app_push_subscriptions_own"
  on public.app_push_subscriptions for all to authenticated
  using (user_id = auth.uid())
  with check (user_id = auth.uid());

grant select, insert, update on public.app_push_subscriptions to authenticated;
grant all on public.app_push_subscriptions to postgres, service_role;
revoke delete on public.app_push_subscriptions from authenticated;

do $$
begin
  alter publication supabase_realtime add table public.app_notifiche;
exception
  when duplicate_object then null;
end
$$;
