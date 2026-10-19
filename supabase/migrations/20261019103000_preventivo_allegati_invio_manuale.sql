-- Preventivo creato da inviare a mano, con allegati che restano sul documento.
-- ISO 9001: audit, soft delete, stato tracciato, niente cancellazione fisica.

alter table public.preventivi drop constraint if exists preventivi_stato_check;
alter table public.preventivi
  add constraint preventivi_stato_check check (
    stato in (
      'creato',
      'in_attesa_spedizione',
      'creato_da_inviare',
      'inviato',
      'accettato',
      'respinto'
    )
  );

alter table public.preventivi
  add column if not exists webmail_invio_id uuid;

comment on column public.preventivi.webmail_invio_id is
  'Mail inviata collegata quando l''operatore conferma l''invio manuale.';

create table if not exists public.preventivi_allegati_invio (
  id uuid primary key default gen_random_uuid(),
  preventivo_id uuid not null references public.preventivi (id),
  storage_path text not null,
  file_name text not null,
  content_type text not null,
  byte_size integer not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  created_by uuid,
  updated_by uuid,
  deleted_at timestamptz,
  deleted_by uuid,
  constraint preventivi_allegati_invio_size_check check (byte_size > 0 and byte_size <= 15728640),
  constraint preventivi_allegati_invio_mime_check check (
    content_type in ('application/pdf', 'image/jpeg', 'image/png', 'image/webp')
  )
);

create index if not exists preventivi_allegati_invio_preventivo_idx
  on public.preventivi_allegati_invio (preventivo_id)
  where deleted_at is null;

alter table public.preventivi_allegati_invio enable row level security;

drop policy if exists "preventivi_allegati_invio_staff_select" on public.preventivi_allegati_invio;
create policy "preventivi_allegati_invio_staff_select"
  on public.preventivi_allegati_invio for select to authenticated
  using (
    public.has_area_access('amministrazione')
    or public.has_area_access('commerciale')
    or public.is_superadmin()
  );

drop policy if exists "preventivi_allegati_invio_staff_write" on public.preventivi_allegati_invio;
create policy "preventivi_allegati_invio_staff_write"
  on public.preventivi_allegati_invio for all to authenticated
  using (
    public.has_area_access('amministrazione')
    or public.has_area_access('commerciale')
    or public.is_superadmin()
  )
  with check (
    public.has_area_access('amministrazione')
    or public.has_area_access('commerciale')
    or public.is_superadmin()
  );

grant select, insert, update on table public.preventivi_allegati_invio to authenticated;
grant all on table public.preventivi_allegati_invio to postgres, service_role;
revoke delete on table public.preventivi_allegati_invio from authenticated;

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'preventivi-allegati',
  'preventivi-allegati',
  false,
  15728640,
  array['application/pdf', 'image/jpeg', 'image/png', 'image/webp']::text[]
)
on conflict (id) do update set
  public = false,
  file_size_limit = excluded.file_size_limit,
  allowed_mime_types = excluded.allowed_mime_types;

drop policy if exists "preventivi_allegati_storage_select" on storage.objects;
create policy "preventivi_allegati_storage_select"
  on storage.objects for select to authenticated
  using (
    bucket_id = 'preventivi-allegati'
    and (
      public.has_area_access('amministrazione')
      or public.has_area_access('commerciale')
      or public.is_superadmin()
    )
  );

drop policy if exists "preventivi_allegati_storage_insert" on storage.objects;
create policy "preventivi_allegati_storage_insert"
  on storage.objects for insert to authenticated
  with check (
    bucket_id = 'preventivi-allegati'
    and (
      public.has_area_access('amministrazione')
      or public.has_area_access('commerciale')
      or public.is_superadmin()
    )
  );
