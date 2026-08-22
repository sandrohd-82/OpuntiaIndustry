-- Foto prodotto magazzino (ISO 9001: informazioni registrate + audit su catalogo)

alter table public.materie_prime
  add column if not exists foto_path text,
  add column if not exists foto_updated_at timestamptz,
  add column if not exists foto_updated_by uuid references auth.users (id) on delete set null;

alter table public.catalogo_prodotti_fornitore
  add column if not exists foto_path text,
  add column if not exists foto_updated_at timestamptz,
  add column if not exists foto_updated_by uuid references auth.users (id) on delete set null;

comment on column public.materie_prime.foto_path is
  'Path Storage foto magazzino (bucket magazzino-prodotti)';
comment on column public.catalogo_prodotti_fornitore.foto_path is
  'Path Storage foto magazzino (bucket magazzino-prodotti)';

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'magazzino-prodotti',
  'magazzino-prodotti',
  false,
  5242880,
  array['image/jpeg', 'image/png', 'image/webp']::text[]
)
on conflict (id) do update set
  file_size_limit = excluded.file_size_limit,
  allowed_mime_types = excluded.allowed_mime_types;

drop policy if exists "magazzino_prodotti_select" on storage.objects;
create policy "magazzino_prodotti_select"
  on storage.objects for select
  to authenticated
  using (
    bucket_id = 'magazzino-prodotti'
    and (
      public.has_area_access('magazzino')
      or public.has_area_access('amministrazione')
      or public.is_superadmin()
    )
  );

drop policy if exists "magazzino_prodotti_insert" on storage.objects;
create policy "magazzino_prodotti_insert"
  on storage.objects for insert
  to authenticated
  with check (
    bucket_id = 'magazzino-prodotti'
    and (
      public.has_area_access('magazzino')
      or public.has_area_access('amministrazione')
      or public.is_superadmin()
    )
  );

drop policy if exists "magazzino_prodotti_update" on storage.objects;
create policy "magazzino_prodotti_update"
  on storage.objects for update
  to authenticated
  using (
    bucket_id = 'magazzino-prodotti'
    and (
      public.has_area_access('magazzino')
      or public.has_area_access('amministrazione')
      or public.is_superadmin()
    )
  )
  with check (
    bucket_id = 'magazzino-prodotti'
    and (
      public.has_area_access('magazzino')
      or public.has_area_access('amministrazione')
      or public.is_superadmin()
    )
  );

drop policy if exists "magazzino_prodotti_delete" on storage.objects;
create policy "magazzino_prodotti_delete"
  on storage.objects for delete
  to authenticated
  using (
    bucket_id = 'magazzino-prodotti'
    and (
      public.has_area_access('magazzino')
      or public.has_area_access('amministrazione')
      or public.is_superadmin()
    )
  );
