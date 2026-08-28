-- Blacklist mittenti WebMail (ISO 9001): blocco import + soft-delete bulk.

create table if not exists public.webmail_blacklist (
  id uuid primary key default gen_random_uuid(),
  -- null = tutte le caselle; valorizzato = solo quella casella
  account_id uuid references public.webmail_accounts (id) on delete cascade,
  email_address text not null,
  note text not null default '',
  source_messaggio_id uuid references public.webmail_messaggi (id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  created_by uuid references auth.users (id) on delete set null,
  updated_by uuid references auth.users (id) on delete set null,
  deleted_at timestamptz,
  deleted_by uuid references auth.users (id) on delete set null,
  constraint webmail_blacklist_email_len check (
    char_length(trim(email_address)) >= 3
    and char_length(email_address) <= 320
  )
);

create unique index if not exists webmail_blacklist_scope_email_uidx
  on public.webmail_blacklist (
    coalesce(account_id, '00000000-0000-0000-0000-000000000000'::uuid),
    lower(email_address)
  )
  where deleted_at is null;

create index if not exists webmail_blacklist_email_idx
  on public.webmail_blacklist (lower(email_address))
  where deleted_at is null;

drop trigger if exists webmail_blacklist_updated_at on public.webmail_blacklist;
create trigger webmail_blacklist_updated_at
  before update on public.webmail_blacklist
  for each row execute function public.set_updated_at();

alter table public.webmail_blacklist enable row level security;

drop policy if exists "webmail_blacklist_all" on public.webmail_blacklist;
create policy "webmail_blacklist_all"
  on public.webmail_blacklist for all to authenticated
  using (
    public.is_superadmin()
    or public.has_area_access('webmail')
    or public.has_area_access('commerciale')
    or public.has_area_access('amministrazione')
  )
  with check (
    public.is_superadmin()
    or public.has_area_access('webmail')
    or public.has_area_access('commerciale')
    or public.has_area_access('amministrazione')
  );

grant select, insert, update on table public.webmail_blacklist to authenticated;
grant all on table public.webmail_blacklist to postgres, service_role;

comment on table public.webmail_blacklist is
  'Mittenti da non importare più. account_id null = globale su tutte le caselle.';
