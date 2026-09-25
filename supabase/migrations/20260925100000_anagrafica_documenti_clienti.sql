-- Documenti su scheda cliente (ISO 9001 7.5 / 8.5.2).
-- Soft delete, audit, stato Bozza/Approvato/Chiuso. Bucket privato.

create table if not exists public.anagrafica_documenti (
  id uuid primary key default gen_random_uuid(),
  cliente_id uuid not null references public.clienti (id),
  tipo text not null,
  titolo text not null,
  note text not null default '',
  storage_path text not null,
  file_name text not null,
  mime text not null,
  file_size integer not null default 0,
  versione integer not null default 1,
  documento_stato text not null default 'bozza'
    check (documento_stato in ('bozza', 'approvato', 'chiuso')),
  approved_by uuid references auth.users (id) on delete set null,
  approved_at timestamptz,
  created_by uuid references auth.users (id) on delete set null,
  updated_by uuid references auth.users (id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz,
  deleted_by uuid references auth.users (id) on delete set null,
  constraint anagrafica_documenti_tipo_check
    check (tipo in ('contratto', 'concordato', 'meeting_resume', 'nda', 'altro')),
  constraint anagrafica_documenti_titolo_len check (char_length(titolo) between 2 and 200),
  constraint anagrafica_documenti_file_size_check check (file_size >= 0 and file_size <= 20971520)
);

create index if not exists anagrafica_documenti_cliente_idx
  on public.anagrafica_documenti (cliente_id, created_at desc)
  where deleted_at is null;

comment on table public.anagrafica_documenti is
  'Allegati della scheda cliente (contratti, concordati, resume meeting). Soft delete.';

drop trigger if exists anagrafica_documenti_updated_at on public.anagrafica_documenti;
create trigger anagrafica_documenti_updated_at
  before update on public.anagrafica_documenti
  for each row execute function public.set_updated_at();

alter table public.anagrafica_documenti enable row level security;

drop policy if exists anagrafica_documenti_select on public.anagrafica_documenti;
create policy anagrafica_documenti_select
  on public.anagrafica_documenti for select to authenticated
  using (
    public.is_superadmin()
    or public.has_area_access('amministrazione')
    or public.has_area_access('commerciale')
  );

drop policy if exists anagrafica_documenti_insert on public.anagrafica_documenti;
create policy anagrafica_documenti_insert
  on public.anagrafica_documenti for insert to authenticated
  with check (
    public.is_superadmin()
    or public.has_area_access('amministrazione')
    or public.has_area_access('commerciale')
  );

drop policy if exists anagrafica_documenti_update on public.anagrafica_documenti;
create policy anagrafica_documenti_update
  on public.anagrafica_documenti for update to authenticated
  using (
    public.is_superadmin()
    or public.has_area_access('amministrazione')
    or public.has_area_access('commerciale')
  )
  with check (
    public.is_superadmin()
    or public.has_area_access('amministrazione')
    or public.has_area_access('commerciale')
  );

grant select, insert, update on table public.anagrafica_documenti to authenticated;
grant all on table public.anagrafica_documenti to postgres, service_role;
revoke delete on table public.anagrafica_documenti from authenticated;

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'anagrafica-documenti',
  'anagrafica-documenti',
  false,
  20971520,
  array[
    'application/pdf',
    'application/msword',
    'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    'image/jpeg',
    'image/png',
    'image/webp'
  ]::text[]
)
on conflict (id) do update set
  public = excluded.public,
  file_size_limit = excluded.file_size_limit,
  allowed_mime_types = excluded.allowed_mime_types;

drop policy if exists anagrafica_documenti_storage_select on storage.objects;
create policy anagrafica_documenti_storage_select
  on storage.objects for select to authenticated
  using (
    bucket_id = 'anagrafica-documenti'
    and (
      public.is_superadmin()
      or public.has_area_access('amministrazione')
      or public.has_area_access('commerciale')
    )
  );

drop policy if exists anagrafica_documenti_storage_insert on storage.objects;
create policy anagrafica_documenti_storage_insert
  on storage.objects for insert to authenticated
  with check (
    bucket_id = 'anagrafica-documenti'
    and (
      public.is_superadmin()
      or public.has_area_access('amministrazione')
      or public.has_area_access('commerciale')
    )
  );

drop policy if exists anagrafica_documenti_storage_update on storage.objects;
create policy anagrafica_documenti_storage_update
  on storage.objects for update to authenticated
  using (
    bucket_id = 'anagrafica-documenti'
    and (
      public.is_superadmin()
      or public.has_area_access('amministrazione')
      or public.has_area_access('commerciale')
    )
  )
  with check (
    bucket_id = 'anagrafica-documenti'
    and (
      public.is_superadmin()
      or public.has_area_access('amministrazione')
      or public.has_area_access('commerciale')
    )
  );
