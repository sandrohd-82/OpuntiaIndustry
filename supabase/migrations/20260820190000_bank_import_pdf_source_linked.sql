-- Fonte doppia CSV + PDF banca collegati al lotto (ISO 9001 — informazioni registrate)

alter table public.bank_import_batches
  add column if not exists csv_storage_path text not null default '';

alter table public.bank_import_batches
  add column if not exists pdf_file_name text not null default '';

alter table public.bank_import_batches
  add column if not exists pdf_sha256 text not null default '';

alter table public.bank_import_batches
  add column if not exists pdf_storage_path text not null default '';

alter table public.bank_import_batches
  add column if not exists pdf_bytes integer not null default 0;

comment on column public.bank_import_batches.csv_storage_path is
  'Path Storage del CSV fonte (bucket bank-statements)';
comment on column public.bank_import_batches.pdf_file_name is
  'Nome file PDF originale estratto conto banca';
comment on column public.bank_import_batches.pdf_sha256 is
  'Hash SHA-256 del PDF originale';
comment on column public.bank_import_batches.pdf_storage_path is
  'Path Storage del PDF originale (bucket bank-statements)';
comment on column public.bank_import_batches.pdf_bytes is
  'Dimensione PDF in byte';

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'bank-statements',
  'bank-statements',
  false,
  52428800,
  array[
    'application/pdf',
    'text/csv',
    'text/plain',
    'application/vnd.ms-excel',
    'application/octet-stream'
  ]::text[]
)
on conflict (id) do update set
  file_size_limit = excluded.file_size_limit,
  allowed_mime_types = excluded.allowed_mime_types;

drop policy if exists "bank_statements_select_fiscale" on storage.objects;
create policy "bank_statements_select_fiscale"
  on storage.objects for select
  to authenticated
  using (
    bucket_id = 'bank-statements'
    and (
      public.has_area_access('area-fiscale')
      or public.has_area_access('amministrazione')
      or public.is_superadmin()
    )
  );

drop policy if exists "bank_statements_insert_fiscale" on storage.objects;
create policy "bank_statements_insert_fiscale"
  on storage.objects for insert
  to authenticated
  with check (
    bucket_id = 'bank-statements'
    and (
      public.has_area_access('area-fiscale')
      or public.has_area_access('amministrazione')
      or public.is_superadmin()
    )
  );

drop policy if exists "bank_statements_update_fiscale" on storage.objects;
create policy "bank_statements_update_fiscale"
  on storage.objects for update
  to authenticated
  using (
    bucket_id = 'bank-statements'
    and (
      public.has_area_access('area-fiscale')
      or public.has_area_access('amministrazione')
      or public.is_superadmin()
    )
  )
  with check (
    bucket_id = 'bank-statements'
    and (
      public.has_area_access('area-fiscale')
      or public.has_area_access('amministrazione')
      or public.is_superadmin()
    )
  );

drop policy if exists "bank_statements_delete_fiscale" on storage.objects;
create policy "bank_statements_delete_fiscale"
  on storage.objects for delete
  to authenticated
  using (
    bucket_id = 'bank-statements'
    and (
      public.has_area_access('area-fiscale')
      or public.has_area_access('amministrazione')
      or public.is_superadmin()
    )
  );
