-- Certificato Bio fornitore: codice + PDF in storage (path su fornitori)

alter table public.fornitori
  add column if not exists bio_certificato_path text not null default '';

comment on column public.fornitori.bio_codice is 'Codice biologico del fornitore';
comment on column public.fornitori.bio_certificato_path is 'Path Storage del PDF certificato bio (bucket fornitori-bio)';
comment on column public.fornitori.bio_certificato is 'Legacy testo libero (non più usato in UI)';

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'fornitori-bio',
  'fornitori-bio',
  false,
  10485760,
  array['application/pdf']::text[]
)
on conflict (id) do update set
  file_size_limit = excluded.file_size_limit,
  allowed_mime_types = excluded.allowed_mime_types;

drop policy if exists "fornitori_bio_select_amministrazione" on storage.objects;
create policy "fornitori_bio_select_amministrazione"
  on storage.objects for select
  to authenticated
  using (
    bucket_id = 'fornitori-bio'
    and (public.has_area_access('amministrazione') or public.is_superadmin())
  );

drop policy if exists "fornitori_bio_insert_amministrazione" on storage.objects;
create policy "fornitori_bio_insert_amministrazione"
  on storage.objects for insert
  to authenticated
  with check (
    bucket_id = 'fornitori-bio'
    and (public.has_area_access('amministrazione') or public.is_superadmin())
  );

drop policy if exists "fornitori_bio_update_amministrazione" on storage.objects;
create policy "fornitori_bio_update_amministrazione"
  on storage.objects for update
  to authenticated
  using (
    bucket_id = 'fornitori-bio'
    and (public.has_area_access('amministrazione') or public.is_superadmin())
  )
  with check (
    bucket_id = 'fornitori-bio'
    and (public.has_area_access('amministrazione') or public.is_superadmin())
  );

drop policy if exists "fornitori_bio_delete_amministrazione" on storage.objects;
create policy "fornitori_bio_delete_amministrazione"
  on storage.objects for delete
  to authenticated
  using (
    bucket_id = 'fornitori-bio'
    and (public.has_area_access('amministrazione') or public.is_superadmin())
  );
