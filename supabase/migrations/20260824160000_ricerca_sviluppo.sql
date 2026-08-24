-- Ricerca e sviluppo + rename Gestionale Fornitori
-- ISO 9001: audit, soft delete, stati/versioni, RBAC/RLS

-- ---------------------------------------------------------------------------
-- Aree menu
-- ---------------------------------------------------------------------------
update public.areas
set
  name = 'Gestionale Fornitori',
  description = 'Quaderno di campagna e calendario raccolto'
where slug = 'area-fornitori';

insert into public.areas (slug, name, description, icon, sort_order, is_active)
values (
  'ricerca-sviluppo',
  'Ricerca e sviluppo',
  'Ricerche processi e materie prime — timeline report',
  'flask-conical',
  15,
  true
)
on conflict (slug) do update
set
  name = excluded.name,
  description = excluded.description,
  icon = excluded.icon,
  sort_order = excluded.sort_order,
  is_active = true;

update public.areas set sort_order = 0 where slug = 'dashboard';
update public.areas set sort_order = 10 where slug = 'amministrazione';
update public.areas set sort_order = 15 where slug = 'ricerca-sviluppo';
update public.areas set sort_order = 20 where slug = 'produzione';
update public.areas set sort_order = 30 where slug = 'magazzino';
update public.areas set sort_order = 45 where slug = 'chat';
update public.areas set sort_order = 55 where slug = 'area-fiscale';
update public.areas set sort_order = 60 where slug = 'area-fornitori';
update public.areas set sort_order = 99 where slug = 'impostazioni';

insert into public.role_area_permissions (role_id, area_id, can_access)
select r.id, a.id, true
from public.app_roles r
cross join public.areas a
where a.slug = 'ricerca-sviluppo'
  and r.code in ('superadmin', 'admin', 'manager')
on conflict (role_id, area_id) do update set can_access = true;

-- ---------------------------------------------------------------------------
-- rs_ricerche
-- ---------------------------------------------------------------------------
create table if not exists public.rs_ricerche (
  id uuid primary key default gen_random_uuid(),
  tipo text not null check (tipo in ('processo', 'materia_prima')),
  titolo text not null,
  descrizione text not null default '',
  stato text not null default 'bozza'
    check (stato in ('bozza', 'in_corso', 'approvato', 'archiviato')),
  versione integer not null default 1 check (versione >= 1),
  approved_at timestamptz,
  approved_by uuid references auth.users (id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  created_by uuid references auth.users (id) on delete set null,
  updated_by uuid references auth.users (id) on delete set null,
  deleted_at timestamptz,
  deleted_by uuid references auth.users (id) on delete set null,
  constraint rs_ricerche_titolo_len check (
    char_length(trim(titolo)) >= 1 and char_length(titolo) <= 200
  )
);

create index if not exists rs_ricerche_tipo_stato_idx
  on public.rs_ricerche (tipo, stato, updated_at desc)
  where deleted_at is null;

drop trigger if exists rs_ricerche_updated_at on public.rs_ricerche;
create trigger rs_ricerche_updated_at
  before update on public.rs_ricerche
  for each row execute function public.set_updated_at();

comment on table public.rs_ricerche is
  'Ricerche R&S (processi / materie prime) — ISO 9001 stati e versioni.';

-- ---------------------------------------------------------------------------
-- rs_report_giornalieri (timeline)
-- ---------------------------------------------------------------------------
create table if not exists public.rs_report_giornalieri (
  id uuid primary key default gen_random_uuid(),
  ricerca_id uuid not null references public.rs_ricerche (id) on delete cascade,
  report_date date not null,
  body_text text not null default '',
  stato text not null default 'bozza'
    check (stato in ('bozza', 'confermato', 'chiuso')),
  versione integer not null default 1 check (versione >= 1),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  created_by uuid references auth.users (id) on delete set null,
  updated_by uuid references auth.users (id) on delete set null,
  deleted_at timestamptz,
  deleted_by uuid references auth.users (id) on delete set null
);

create unique index if not exists rs_report_giornalieri_open_uidx
  on public.rs_report_giornalieri (ricerca_id, report_date)
  where deleted_at is null;

create index if not exists rs_report_giornalieri_ricerca_idx
  on public.rs_report_giornalieri (ricerca_id, report_date desc)
  where deleted_at is null;

drop trigger if exists rs_report_giornalieri_updated_at on public.rs_report_giornalieri;
create trigger rs_report_giornalieri_updated_at
  before update on public.rs_report_giornalieri
  for each row execute function public.set_updated_at();

-- ---------------------------------------------------------------------------
-- Mentions @utente
-- ---------------------------------------------------------------------------
create table if not exists public.rs_report_mentions (
  id uuid primary key default gen_random_uuid(),
  report_id uuid not null references public.rs_report_giornalieri (id) on delete cascade,
  user_id uuid not null references auth.users (id) on delete cascade,
  created_at timestamptz not null default now(),
  created_by uuid references auth.users (id) on delete set null,
  deleted_at timestamptz,
  deleted_by uuid references auth.users (id) on delete set null
);

create unique index if not exists rs_report_mentions_open_uidx
  on public.rs_report_mentions (report_id, user_id)
  where deleted_at is null;

-- ---------------------------------------------------------------------------
-- Link chat / argomenti
-- ---------------------------------------------------------------------------
create table if not exists public.rs_report_chat_links (
  id uuid primary key default gen_random_uuid(),
  report_id uuid not null references public.rs_report_giornalieri (id) on delete cascade,
  link_kind text not null check (link_kind in ('conversation', 'topic')),
  link_id uuid not null,
  label text not null default '',
  created_at timestamptz not null default now(),
  created_by uuid references auth.users (id) on delete set null,
  deleted_at timestamptz,
  deleted_by uuid references auth.users (id) on delete set null
);

create index if not exists rs_report_chat_links_report_idx
  on public.rs_report_chat_links (report_id)
  where deleted_at is null;

-- ---------------------------------------------------------------------------
-- Link URL / Maps
-- ---------------------------------------------------------------------------
create table if not exists public.rs_report_links (
  id uuid primary key default gen_random_uuid(),
  report_id uuid not null references public.rs_report_giornalieri (id) on delete cascade,
  kind text not null check (kind in ('url', 'maps')),
  url text not null default '',
  label text not null default '',
  place_text text not null default '',
  created_at timestamptz not null default now(),
  created_by uuid references auth.users (id) on delete set null,
  deleted_at timestamptz,
  deleted_by uuid references auth.users (id) on delete set null
);

create index if not exists rs_report_links_report_idx
  on public.rs_report_links (report_id)
  where deleted_at is null;

-- ---------------------------------------------------------------------------
-- Allegati
-- ---------------------------------------------------------------------------
create table if not exists public.rs_report_allegati (
  id uuid primary key default gen_random_uuid(),
  report_id uuid not null references public.rs_report_giornalieri (id) on delete cascade,
  storage_path text not null,
  file_name text not null,
  mime_type text not null default 'application/octet-stream',
  kind text not null
    check (kind in ('file', 'image', 'video', 'audio', 'pdf', 'doc')),
  size_bytes bigint not null default 0,
  include_in_print boolean not null default true,
  created_at timestamptz not null default now(),
  created_by uuid references auth.users (id) on delete set null,
  deleted_at timestamptz,
  deleted_by uuid references auth.users (id) on delete set null
);

create index if not exists rs_report_allegati_report_idx
  on public.rs_report_allegati (report_id)
  where deleted_at is null;

-- Video/audio: default esclusi dalla stampa
create or replace function public.trg_rs_allegati_print_default()
returns trigger
language plpgsql
as $$
begin
  if new.kind in ('video', 'audio') then
    new.include_in_print := false;
  end if;
  return new;
end;
$$;

drop trigger if exists rs_report_allegati_print_default on public.rs_report_allegati;
create trigger rs_report_allegati_print_default
  before insert on public.rs_report_allegati
  for each row execute function public.trg_rs_allegati_print_default();

-- ---------------------------------------------------------------------------
-- RLS
-- ---------------------------------------------------------------------------
alter table public.rs_ricerche enable row level security;
alter table public.rs_report_giornalieri enable row level security;
alter table public.rs_report_mentions enable row level security;
alter table public.rs_report_chat_links enable row level security;
alter table public.rs_report_links enable row level security;
alter table public.rs_report_allegati enable row level security;

create policy "rs_ricerche_select" on public.rs_ricerche
  for select to authenticated
  using (
    deleted_at is null
    and (public.has_area_access('ricerca-sviluppo') or public.is_superadmin())
  );
create policy "rs_ricerche_insert" on public.rs_ricerche
  for insert to authenticated
  with check (
    public.has_area_access('ricerca-sviluppo') or public.is_superadmin()
  );
create policy "rs_ricerche_update" on public.rs_ricerche
  for update to authenticated
  using (public.has_area_access('ricerca-sviluppo') or public.is_superadmin())
  with check (public.has_area_access('ricerca-sviluppo') or public.is_superadmin());

create policy "rs_report_select" on public.rs_report_giornalieri
  for select to authenticated
  using (
    deleted_at is null
    and (public.has_area_access('ricerca-sviluppo') or public.is_superadmin())
  );
create policy "rs_report_insert" on public.rs_report_giornalieri
  for insert to authenticated
  with check (public.has_area_access('ricerca-sviluppo') or public.is_superadmin());
create policy "rs_report_update" on public.rs_report_giornalieri
  for update to authenticated
  using (public.has_area_access('ricerca-sviluppo') or public.is_superadmin())
  with check (public.has_area_access('ricerca-sviluppo') or public.is_superadmin());

create policy "rs_mentions_all" on public.rs_report_mentions
  for all to authenticated
  using (public.has_area_access('ricerca-sviluppo') or public.is_superadmin())
  with check (public.has_area_access('ricerca-sviluppo') or public.is_superadmin());

create policy "rs_chat_links_all" on public.rs_report_chat_links
  for all to authenticated
  using (public.has_area_access('ricerca-sviluppo') or public.is_superadmin())
  with check (public.has_area_access('ricerca-sviluppo') or public.is_superadmin());

create policy "rs_links_all" on public.rs_report_links
  for all to authenticated
  using (public.has_area_access('ricerca-sviluppo') or public.is_superadmin())
  with check (public.has_area_access('ricerca-sviluppo') or public.is_superadmin());

create policy "rs_allegati_all" on public.rs_report_allegati
  for all to authenticated
  using (public.has_area_access('ricerca-sviluppo') or public.is_superadmin())
  with check (public.has_area_access('ricerca-sviluppo') or public.is_superadmin());

grant select, insert, update on public.rs_ricerche to authenticated;
grant select, insert, update on public.rs_report_giornalieri to authenticated;
grant select, insert, update on public.rs_report_mentions to authenticated;
grant select, insert, update on public.rs_report_chat_links to authenticated;
grant select, insert, update on public.rs_report_links to authenticated;
grant select, insert, update on public.rs_report_allegati to authenticated;
grant all on public.rs_ricerche to postgres, service_role;
grant all on public.rs_report_giornalieri to postgres, service_role;
grant all on public.rs_report_mentions to postgres, service_role;
grant all on public.rs_report_chat_links to postgres, service_role;
grant all on public.rs_report_links to postgres, service_role;
grant all on public.rs_report_allegati to postgres, service_role;
revoke delete on public.rs_ricerche from authenticated;
revoke delete on public.rs_report_giornalieri from authenticated;
revoke delete on public.rs_report_mentions from authenticated;
revoke delete on public.rs_report_chat_links from authenticated;
revoke delete on public.rs_report_links from authenticated;
revoke delete on public.rs_report_allegati from authenticated;

-- ---------------------------------------------------------------------------
-- Storage
-- ---------------------------------------------------------------------------
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'rs-allegati',
  'rs-allegati',
  false,
  52428800,
  array[
    'image/jpeg', 'image/png', 'image/webp', 'image/gif',
    'application/pdf',
    'application/msword',
    'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    'application/vnd.ms-excel',
    'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    'text/plain',
    'video/mp4', 'video/webm',
    'audio/webm', 'audio/ogg', 'audio/mpeg', 'audio/mp4', 'audio/wav'
  ]::text[]
)
on conflict (id) do update set
  public = excluded.public,
  file_size_limit = excluded.file_size_limit,
  allowed_mime_types = excluded.allowed_mime_types;

drop policy if exists "rs_allegati_storage_select" on storage.objects;
create policy "rs_allegati_storage_select"
  on storage.objects for select to authenticated
  using (
    bucket_id = 'rs-allegati'
    and (public.has_area_access('ricerca-sviluppo') or public.is_superadmin())
  );

drop policy if exists "rs_allegati_storage_insert" on storage.objects;
create policy "rs_allegati_storage_insert"
  on storage.objects for insert to authenticated
  with check (
    bucket_id = 'rs-allegati'
    and (public.has_area_access('ricerca-sviluppo') or public.is_superadmin())
  );

drop policy if exists "rs_allegati_storage_update" on storage.objects;
create policy "rs_allegati_storage_update"
  on storage.objects for update to authenticated
  using (
    bucket_id = 'rs-allegati'
    and (public.has_area_access('ricerca-sviluppo') or public.is_superadmin())
  )
  with check (
    bucket_id = 'rs-allegati'
    and (public.has_area_access('ricerca-sviluppo') or public.is_superadmin())
  );
