-- Ticket gestionale (ISO 9001 7.5 / 8.5.2 / 10.2).
-- A2: autore vede i propri; Super Admin / Amministrazione vedono tutto.
-- B1: solo Super Admin / Amministrazione risolvono e archiviano.
-- Soft delete, mai DELETE fisico. Bucket privato.

create sequence if not exists public.strumenti_ticket_codice_seq;

create or replace function public.next_strumenti_ticket_codice()
returns text
language plpgsql
as $$
declare
  n bigint;
begin
  n := nextval('public.strumenti_ticket_codice_seq');
  return 'TCK-' || lpad(n::text, 4, '0');
end;
$$;

create table if not exists public.strumenti_ticket (
  id uuid primary key default gen_random_uuid(),
  codice text not null default public.next_strumenti_ticket_codice(),
  categoria text not null
    check (categoria in ('bug', 'funzioni', 'miglioramenti')),
  urgenza text not null
    check (urgenza in ('non_urgente', 'poco_urgente', 'urgente')),
  titolo text not null default '',
  descrizione text not null default '',
  documento_stato text not null default 'bozza'
    check (documento_stato in ('bozza', 'in_carico', 'risolto', 'archiviato')),
  versione integer not null default 1,
  resolved_by uuid references auth.users (id) on delete set null,
  resolved_at timestamptz,
  archiviato_at timestamptz,
  archiviato_by uuid references auth.users (id) on delete set null,
  created_by uuid references auth.users (id) on delete set null,
  updated_by uuid references auth.users (id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz,
  deleted_by uuid references auth.users (id) on delete set null
);

create unique index if not exists strumenti_ticket_codice_uidx
  on public.strumenti_ticket (codice)
  where deleted_at is null;

create index if not exists strumenti_ticket_viva_idx
  on public.strumenti_ticket (categoria, urgenza, created_at desc)
  where deleted_at is null and archiviato_at is null;

create index if not exists strumenti_ticket_archivio_idx
  on public.strumenti_ticket (archiviato_at desc)
  where deleted_at is null and archiviato_at is not null;

create index if not exists strumenti_ticket_autore_idx
  on public.strumenti_ticket (created_by)
  where deleted_at is null;

comment on table public.strumenti_ticket is
  'Segnalazioni gestionale (bug, funzioni, miglioramenti). Chat sul ticket; risolti in Archivio.';
comment on column public.strumenti_ticket.documento_stato is
  'Bozza / In carico / Risolto / Archiviato.';

create table if not exists public.strumenti_ticket_messaggi (
  id uuid primary key default gen_random_uuid(),
  ticket_id uuid not null references public.strumenti_ticket (id),
  contenuto text not null default '',
  tipo text not null default 'testo'
    check (tipo in ('testo', 'vocale', 'file', 'misto')),
  created_by uuid references auth.users (id) on delete set null,
  updated_by uuid references auth.users (id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz,
  deleted_by uuid references auth.users (id) on delete set null
);

create index if not exists strumenti_ticket_msg_ticket_idx
  on public.strumenti_ticket_messaggi (ticket_id, created_at)
  where deleted_at is null;

comment on table public.strumenti_ticket_messaggi is
  'Chat del ticket: testo, vocale e file.';

create table if not exists public.strumenti_ticket_file (
  id uuid primary key default gen_random_uuid(),
  ticket_id uuid not null references public.strumenti_ticket (id),
  messaggio_id uuid references public.strumenti_ticket_messaggi (id),
  storage_path text not null,
  file_name text not null,
  mime text not null default '',
  file_size integer not null default 0,
  kind text not null default 'allegato'
    check (kind in ('allegato', 'vocale', 'immagine')),
  created_by uuid references auth.users (id) on delete set null,
  updated_by uuid references auth.users (id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz,
  deleted_by uuid references auth.users (id) on delete set null
);

create index if not exists strumenti_ticket_file_ticket_idx
  on public.strumenti_ticket_file (ticket_id, messaggio_id)
  where deleted_at is null;

comment on table public.strumenti_ticket_file is
  'Allegati e vocali del ticket (storage privato).';

drop trigger if exists strumenti_ticket_updated_at on public.strumenti_ticket;
create trigger strumenti_ticket_updated_at
  before update on public.strumenti_ticket
  for each row execute function public.set_updated_at();

drop trigger if exists strumenti_ticket_msg_updated_at on public.strumenti_ticket_messaggi;
create trigger strumenti_ticket_msg_updated_at
  before update on public.strumenti_ticket_messaggi
  for each row execute function public.set_updated_at();

drop trigger if exists strumenti_ticket_file_updated_at on public.strumenti_ticket_file;
create trigger strumenti_ticket_file_updated_at
  before update on public.strumenti_ticket_file
  for each row execute function public.set_updated_at();

create or replace function public.can_see_strumenti_ticket(p_created_by uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select
    public.is_superadmin()
    or public.has_area_access('amministrazione')
    or (p_created_by is not null and p_created_by = auth.uid());
$$;

create or replace function public.can_write_strumenti_ticket()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select
    public.is_superadmin()
    or public.has_area_access('amministrazione')
    or public.has_area_access('strumenti');
$$;

create or replace function public.can_gestire_strumenti_ticket()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select
    public.is_superadmin()
    or public.has_area_access('amministrazione');
$$;

alter table public.strumenti_ticket enable row level security;
alter table public.strumenti_ticket_messaggi enable row level security;
alter table public.strumenti_ticket_file enable row level security;

drop policy if exists strumenti_ticket_select on public.strumenti_ticket;
create policy strumenti_ticket_select
  on public.strumenti_ticket for select to authenticated
  using (
    deleted_at is null
    and public.can_see_strumenti_ticket(created_by)
  );

drop policy if exists strumenti_ticket_insert on public.strumenti_ticket;
create policy strumenti_ticket_insert
  on public.strumenti_ticket for insert to authenticated
  with check (public.can_write_strumenti_ticket());

drop policy if exists strumenti_ticket_update on public.strumenti_ticket;
create policy strumenti_ticket_update
  on public.strumenti_ticket for update to authenticated
  using (
    deleted_at is null
    and (
      public.can_gestire_strumenti_ticket()
      or created_by = auth.uid()
    )
  )
  with check (
    public.can_gestire_strumenti_ticket()
    or created_by = auth.uid()
  );

drop policy if exists strumenti_ticket_msg_select on public.strumenti_ticket_messaggi;
create policy strumenti_ticket_msg_select
  on public.strumenti_ticket_messaggi for select to authenticated
  using (
    deleted_at is null
    and exists (
      select 1 from public.strumenti_ticket t
      where t.id = ticket_id
        and t.deleted_at is null
        and public.can_see_strumenti_ticket(t.created_by)
    )
  );

drop policy if exists strumenti_ticket_msg_insert on public.strumenti_ticket_messaggi;
create policy strumenti_ticket_msg_insert
  on public.strumenti_ticket_messaggi for insert to authenticated
  with check (
    public.can_write_strumenti_ticket()
    and exists (
      select 1 from public.strumenti_ticket t
      where t.id = ticket_id
        and t.deleted_at is null
        and t.archiviato_at is null
        and public.can_see_strumenti_ticket(t.created_by)
    )
  );

drop policy if exists strumenti_ticket_msg_update on public.strumenti_ticket_messaggi;
create policy strumenti_ticket_msg_update
  on public.strumenti_ticket_messaggi for update to authenticated
  using (public.can_gestire_strumenti_ticket())
  with check (public.can_gestire_strumenti_ticket());

drop policy if exists strumenti_ticket_file_select on public.strumenti_ticket_file;
create policy strumenti_ticket_file_select
  on public.strumenti_ticket_file for select to authenticated
  using (
    deleted_at is null
    and exists (
      select 1 from public.strumenti_ticket t
      where t.id = ticket_id
        and t.deleted_at is null
        and public.can_see_strumenti_ticket(t.created_by)
    )
  );

drop policy if exists strumenti_ticket_file_insert on public.strumenti_ticket_file;
create policy strumenti_ticket_file_insert
  on public.strumenti_ticket_file for insert to authenticated
  with check (
    public.can_write_strumenti_ticket()
    and exists (
      select 1 from public.strumenti_ticket t
      where t.id = ticket_id
        and t.deleted_at is null
        and public.can_see_strumenti_ticket(t.created_by)
    )
  );

drop policy if exists strumenti_ticket_file_update on public.strumenti_ticket_file;
create policy strumenti_ticket_file_update
  on public.strumenti_ticket_file for update to authenticated
  using (public.can_gestire_strumenti_ticket())
  with check (public.can_gestire_strumenti_ticket());

grant select, insert, update on table public.strumenti_ticket to authenticated;
grant select, insert, update on table public.strumenti_ticket_messaggi to authenticated;
grant select, insert, update on table public.strumenti_ticket_file to authenticated;
grant all on table public.strumenti_ticket to postgres, service_role;
grant all on table public.strumenti_ticket_messaggi to postgres, service_role;
grant all on table public.strumenti_ticket_file to postgres, service_role;
revoke delete on table public.strumenti_ticket from authenticated;
revoke delete on table public.strumenti_ticket_messaggi from authenticated;
revoke delete on table public.strumenti_ticket_file from authenticated;

grant usage, select on sequence public.strumenti_ticket_codice_seq to authenticated, service_role;
grant execute on function public.next_strumenti_ticket_codice() to authenticated, service_role;
grant execute on function public.can_see_strumenti_ticket(uuid) to authenticated, service_role;
grant execute on function public.can_write_strumenti_ticket() to authenticated, service_role;
grant execute on function public.can_gestire_strumenti_ticket() to authenticated, service_role;

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'ticket-gestionale',
  'ticket-gestionale',
  false,
  15728640,
  array[
    'application/pdf',
    'image/jpeg',
    'image/png',
    'image/webp',
    'image/gif',
    'audio/webm',
    'audio/ogg',
    'audio/mpeg',
    'audio/mp4',
    'audio/wav',
    'application/zip',
    'text/plain',
    'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'
  ]::text[]
)
on conflict (id) do update set
  public = excluded.public,
  file_size_limit = excluded.file_size_limit,
  allowed_mime_types = excluded.allowed_mime_types;
