-- Foto per posto magazzino (ISO 9001: audit, soft delete, versione/stato).
-- Una o più immagini per ubicazione; principale sulle viste laterali, mai Dall'alto.

create table if not exists public.magazzino_posto_foto (
  id uuid primary key default gen_random_uuid(),
  ubicazione_id uuid not null references public.magazzino_ubicazioni (id),
  storage_path text not null,
  file_name text not null default '',
  mime text not null default 'image/jpeg',
  is_principale boolean not null default false,
  sort_order int not null default 0,
  fit_scale numeric not null default 2,
  offset_x numeric not null default 0,
  offset_y numeric not null default 0,
  versione int not null default 1,
  documento_stato text not null default 'approvato',
  note text not null default '',
  created_by uuid references auth.users (id) on delete set null,
  updated_by uuid references auth.users (id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz,
  deleted_by uuid references auth.users (id) on delete set null,
  constraint mag_posto_foto_doc_check check (
    documento_stato in ('bozza', 'approvato', 'chiuso')
  ),
  constraint mag_posto_foto_scale_check check (fit_scale >= 0.5 and fit_scale <= 8),
  constraint mag_posto_foto_offset_check check (
    offset_x between -4 and 4 and offset_y between -4 and 4
  )
);

create index if not exists mag_posto_foto_ubi_idx
  on public.magazzino_posto_foto (ubicazione_id)
  where deleted_at is null;

create unique index if not exists mag_posto_foto_principale_uidx
  on public.magazzino_posto_foto (ubicazione_id)
  where deleted_at is null and is_principale;

comment on table public.magazzino_posto_foto is
  'Foto del posto: principale in pianta (viste laterali), miniature e carosello in elenco.';

drop trigger if exists mag_posto_foto_updated_at on public.magazzino_posto_foto;
create trigger mag_posto_foto_updated_at
  before update on public.magazzino_posto_foto
  for each row execute function public.set_updated_at();

alter table public.magazzino_posto_foto enable row level security;

drop policy if exists mag_posto_foto_select on public.magazzino_posto_foto;
create policy mag_posto_foto_select
  on public.magazzino_posto_foto for select to authenticated
  using (
    deleted_at is null
    and (
      public.is_superadmin()
      or public.has_area_access('magazzino')
      or public.has_area_access('strumenti')
      or public.has_area_access('amministrazione')
    )
  );

drop policy if exists mag_posto_foto_insert on public.magazzino_posto_foto;
create policy mag_posto_foto_insert
  on public.magazzino_posto_foto for insert to authenticated
  with check (
    public.is_superadmin()
    or public.has_area_access('magazzino')
    or public.has_area_access('amministrazione')
  );

drop policy if exists mag_posto_foto_update on public.magazzino_posto_foto;
create policy mag_posto_foto_update
  on public.magazzino_posto_foto for update to authenticated
  using (
    public.is_superadmin()
    or public.has_area_access('magazzino')
    or public.has_area_access('amministrazione')
  )
  with check (
    public.is_superadmin()
    or public.has_area_access('magazzino')
    or public.has_area_access('amministrazione')
  );

grant select, insert, update on table public.magazzino_posto_foto to authenticated;
grant all on table public.magazzino_posto_foto to postgres, service_role;
revoke delete on table public.magazzino_posto_foto from authenticated;

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'posto-foto',
  'posto-foto',
  false,
  15728640,
  array['image/jpeg', 'image/jpg', 'image/png', 'image/webp']
)
on conflict (id) do update set
  file_size_limit = excluded.file_size_limit,
  allowed_mime_types = excluded.allowed_mime_types,
  public = false;

drop policy if exists posto_foto_storage_select on storage.objects;
create policy posto_foto_storage_select
  on storage.objects for select to authenticated
  using (
    bucket_id = 'posto-foto'
    and (
      public.is_superadmin()
      or public.has_area_access('magazzino')
      or public.has_area_access('strumenti')
      or public.has_area_access('amministrazione')
    )
  );

drop policy if exists posto_foto_storage_insert on storage.objects;
create policy posto_foto_storage_insert
  on storage.objects for insert to authenticated
  with check (
    bucket_id = 'posto-foto'
    and (
      public.is_superadmin()
      or public.has_area_access('magazzino')
      or public.has_area_access('amministrazione')
    )
  );

drop policy if exists posto_foto_storage_update on storage.objects;
create policy posto_foto_storage_update
  on storage.objects for update to authenticated
  using (
    bucket_id = 'posto-foto'
    and (
      public.is_superadmin()
      or public.has_area_access('magazzino')
      or public.has_area_access('amministrazione')
    )
  )
  with check (
    bucket_id = 'posto-foto'
    and (
      public.is_superadmin()
      or public.has_area_access('magazzino')
      or public.has_area_access('amministrazione')
    )
  );
