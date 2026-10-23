-- Documentazione bancaria del commercialista (ISO 9001 7.5 / 8.5.2).
-- Un file corrente per posto e trimestre. La sostituzione conserva la riga precedente (soft delete).
-- Nessun DELETE fisico: il file in storage resta per l'audit.

create table if not exists public.documentazione_bancaria (
  id uuid primary key default gen_random_uuid(),
  anno integer not null,
  trimestre integer not null,
  slot text not null,
  versione integer not null default 1,
  documento_stato text not null default 'approvato',
  storage_path text not null,
  file_name text not null,
  original_file_name text not null,
  mime text not null,
  file_size integer not null,
  sha256 text not null,
  created_by uuid references auth.users (id) on delete set null,
  updated_by uuid references auth.users (id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz,
  deleted_by uuid references auth.users (id) on delete set null,
  constraint documentazione_bancaria_anno_check check (anno >= 2000 and anno <= 2100),
  constraint documentazione_bancaria_trim_check check (trimestre between 1 and 4),
  constraint documentazione_bancaria_versione_check check (versione >= 1),
  constraint documentazione_bancaria_slot_check check (
    slot in (
      'estratto_originale_excel',
      'estratto_originale_pdf',
      'estratto_unico_csv',
      'estratto_unico_excel',
      'prospetto_originale_excel',
      'prospetto_originale_pdf'
    )
  ),
  constraint documentazione_bancaria_stato_check check (
    documento_stato in ('bozza', 'approvato', 'chiuso')
  )
);

create unique index if not exists documentazione_bancaria_slot_vivo_uidx
  on public.documentazione_bancaria (anno, trimestre, slot)
  where deleted_at is null;

create index if not exists documentazione_bancaria_periodo_idx
  on public.documentazione_bancaria (anno, trimestre, created_at desc)
  where deleted_at is null;

comment on table public.documentazione_bancaria is
  'Documenti banca del trimestre commercialista. Una riga viva per posto. La sostituzione archivia la precedente con deleted_at.';

drop trigger if exists documentazione_bancaria_updated_at on public.documentazione_bancaria;
create trigger documentazione_bancaria_updated_at
  before update on public.documentazione_bancaria
  for each row execute function public.set_updated_at();

alter table public.documentazione_bancaria enable row level security;

drop policy if exists documentazione_bancaria_select on public.documentazione_bancaria;
create policy documentazione_bancaria_select
  on public.documentazione_bancaria for select to authenticated
  using (
    public.has_area_access('area-fiscale')
    or public.has_area_access('amministrazione')
    or public.is_superadmin()
  );

drop policy if exists documentazione_bancaria_insert on public.documentazione_bancaria;
create policy documentazione_bancaria_insert
  on public.documentazione_bancaria for insert to authenticated
  with check (
    public.has_area_access('area-fiscale')
    or public.has_area_access('amministrazione')
    or public.is_superadmin()
  );

drop policy if exists documentazione_bancaria_update on public.documentazione_bancaria;
create policy documentazione_bancaria_update
  on public.documentazione_bancaria for update to authenticated
  using (
    public.has_area_access('area-fiscale')
    or public.has_area_access('amministrazione')
    or public.is_superadmin()
  )
  with check (
    public.has_area_access('area-fiscale')
    or public.has_area_access('amministrazione')
    or public.is_superadmin()
  );

grant select, insert, update on table public.documentazione_bancaria to authenticated;
grant all on table public.documentazione_bancaria to postgres, service_role;
revoke delete on table public.documentazione_bancaria from authenticated;

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'documentazione-bancaria',
  'documentazione-bancaria',
  false,
  41943040,
  array[
    'application/pdf',
    'text/csv',
    'application/csv',
    'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'
  ]::text[]
)
on conflict (id) do update set
  public = excluded.public,
  file_size_limit = excluded.file_size_limit,
  allowed_mime_types = excluded.allowed_mime_types;

drop policy if exists documentazione_bancaria_storage_select on storage.objects;
create policy documentazione_bancaria_storage_select
  on storage.objects for select to authenticated
  using (
    bucket_id = 'documentazione-bancaria'
    and (
      public.has_area_access('area-fiscale')
      or public.has_area_access('amministrazione')
      or public.is_superadmin()
    )
  );

drop policy if exists documentazione_bancaria_storage_insert on storage.objects;
create policy documentazione_bancaria_storage_insert
  on storage.objects for insert to authenticated
  with check (
    bucket_id = 'documentazione-bancaria'
    and (
      public.has_area_access('area-fiscale')
      or public.has_area_access('amministrazione')
      or public.is_superadmin()
    )
  );
