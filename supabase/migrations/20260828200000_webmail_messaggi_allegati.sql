-- Allegati messaggi WebMail (inline CID / logo) — ISO 9001

create table if not exists public.webmail_messaggi_allegati (
  id uuid primary key default gen_random_uuid(),
  messaggio_id uuid not null references public.webmail_messaggi (id) on delete cascade,
  filename text not null default '',
  mime_type text not null default 'application/octet-stream',
  size_bytes integer not null default 0 check (size_bytes >= 0),
  /** Content-ID senza <>, per riscrivere src="cid:…" */
  content_id text not null default '',
  is_inline boolean not null default false,
  storage_bucket text not null default 'webmail-allegati',
  storage_path text not null default '',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  created_by uuid references auth.users (id) on delete set null,
  updated_by uuid references auth.users (id) on delete set null,
  deleted_at timestamptz,
  deleted_by uuid references auth.users (id) on delete set null
);

create index if not exists webmail_messaggi_allegati_msg_idx
  on public.webmail_messaggi_allegati (messaggio_id)
  where deleted_at is null;

create index if not exists webmail_messaggi_allegati_cid_idx
  on public.webmail_messaggi_allegati (messaggio_id, content_id)
  where deleted_at is null and content_id <> '';

drop trigger if exists webmail_messaggi_allegati_updated_at on public.webmail_messaggi_allegati;
create trigger webmail_messaggi_allegati_updated_at
  before update on public.webmail_messaggi_allegati
  for each row execute function public.set_updated_at();

alter table public.webmail_messaggi_allegati enable row level security;

drop policy if exists "webmail_messaggi_allegati_all" on public.webmail_messaggi_allegati;
create policy "webmail_messaggi_allegati_all"
  on public.webmail_messaggi_allegati for all to authenticated
  using (
    exists (
      select 1
      from public.webmail_messaggi m
      where m.id = messaggio_id
        and public.can_access_webmail_account(m.account_id)
    )
  )
  with check (
    exists (
      select 1
      from public.webmail_messaggi m
      where m.id = messaggio_id
        and public.can_access_webmail_account(m.account_id)
    )
  );

grant select, insert, update on table public.webmail_messaggi_allegati to authenticated;
grant all on table public.webmail_messaggi_allegati to postgres, service_role;
revoke delete on table public.webmail_messaggi_allegati from authenticated;

comment on table public.webmail_messaggi_allegati is
  'Allegati messaggio WebMail (file e inline CID) — ISO 7.5 / 8.5.2';
comment on column public.webmail_messaggi_allegati.content_id is
  'Content-ID normalizzato (senza <>) per rewrite cid: nelle mail HTML';

-- Bucket storage (privato; URL firmate via service role)
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'webmail-allegati',
  'webmail-allegati',
  false,
  26214400,
  array[
    'image/jpeg', 'image/png', 'image/webp', 'image/gif', 'image/svg+xml',
    'application/pdf',
    'application/msword',
    'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    'application/vnd.ms-excel',
    'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    'application/rtf',
    'text/plain',
    'text/html',
    'application/octet-stream'
  ]::text[]
)
on conflict (id) do update
set
  public = false,
  file_size_limit = excluded.file_size_limit,
  allowed_mime_types = excluded.allowed_mime_types;

-- Sync/cron usa service_role; utenti autenticati leggono via signed URL server-side.
-- Policy storage: solo service_role (default) — nessuna policy authenticated su objects.
