-- Documentazioni aziendali (ISO 9001 7.5 / 8.5.2 / 10.2).
-- Solo Super Admin. Soft delete, mai DELETE fisico. Bucket privato.

create sequence if not exists public.documentazioni_aziendali_codice_seq;

create or replace function public.next_documentazione_codice()
returns text
language plpgsql
as $$
declare
  n bigint;
begin
  n := nextval('public.documentazioni_aziendali_codice_seq');
  return 'DOC-' || lpad(n::text, 4, '0');
end;
$$;

create table if not exists public.documentazioni_aziendali (
  id uuid primary key default gen_random_uuid(),
  codice text not null default public.next_documentazione_codice(),
  nome text not null,
  reparto_id uuid not null references public.organigramma_reparti (id),
  spiegazione text not null default '',
  data_inizio date not null,
  data_scadenza date not null,
  necessita_rinnovo boolean not null default false,
  stato_operativo text not null default 'in_attesa'
    check (stato_operativo in ('in_attesa', 'in_carico', 'scaduto')),
  documento_stato text not null default 'bozza'
    check (documento_stato in ('bozza', 'approvato', 'chiuso')),
  versione integer not null default 1,
  approved_by uuid references auth.users (id) on delete set null,
  approved_at timestamptz,
  archiviato_at timestamptz,
  archiviato_by uuid references auth.users (id) on delete set null,
  created_by uuid references auth.users (id) on delete set null,
  updated_by uuid references auth.users (id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz,
  deleted_by uuid references auth.users (id) on delete set null,
  check (data_scadenza >= data_inizio)
);

create unique index if not exists documentazioni_aziendali_codice_uidx
  on public.documentazioni_aziendali (codice)
  where deleted_at is null;

create index if not exists documentazioni_aziendali_viva_idx
  on public.documentazioni_aziendali (stato_operativo, data_scadenza)
  where deleted_at is null and archiviato_at is null;

create index if not exists documentazioni_aziendali_archivio_idx
  on public.documentazioni_aziendali (archiviato_at desc)
  where deleted_at is null and archiviato_at is not null;

create index if not exists documentazioni_aziendali_reparto_idx
  on public.documentazioni_aziendali (reparto_id)
  where deleted_at is null;

comment on table public.documentazioni_aziendali is
  'Schede documentazioni aziendali. Stessa riga al rinnovo; versioni scadute in documentazioni_versioni.';
comment on column public.documentazioni_aziendali.stato_operativo is
  'In attesa / In carico / Scaduto. Lo Scaduto resta in Amministrazione finché non si archivia (B1).';
comment on column public.documentazioni_aziendali.documento_stato is
  'Stato pratica ISO: bozza, approvato, chiuso.';
comment on column public.documentazioni_aziendali.archiviato_at is
  'Consenso Super Admin al passaggio in Archivio > Amministrazione > Documentazioni.';

create table if not exists public.documentazioni_file (
  id uuid primary key default gen_random_uuid(),
  documentazione_id uuid not null references public.documentazioni_aziendali (id),
  versione integer not null,
  storage_path text not null,
  file_name text not null,
  mime text not null,
  file_size integer not null default 0,
  sort_order integer not null default 0,
  created_by uuid references auth.users (id) on delete set null,
  updated_by uuid references auth.users (id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz,
  deleted_by uuid references auth.users (id) on delete set null
);

create index if not exists documentazioni_file_scheda_ver_idx
  on public.documentazioni_file (documentazione_id, versione, sort_order)
  where deleted_at is null;

comment on table public.documentazioni_file is
  'Allegati (molti per scheda). La versione collega il file alla scheda corrente o allo storico.';

create table if not exists public.documentazioni_versioni (
  id uuid primary key default gen_random_uuid(),
  documentazione_id uuid not null references public.documentazioni_aziendali (id),
  versione integer not null,
  nome text not null,
  reparto_id uuid references public.organigramma_reparti (id) on delete set null,
  spiegazione text not null default '',
  data_inizio date not null,
  data_scadenza date not null,
  necessita_rinnovo boolean not null default false,
  stato_operativo text not null,
  documento_stato text not null,
  rinnovato_at timestamptz not null default now(),
  rinnovato_by uuid references auth.users (id) on delete set null,
  created_by uuid references auth.users (id) on delete set null,
  updated_by uuid references auth.users (id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz,
  deleted_by uuid references auth.users (id) on delete set null,
  unique (documentazione_id, versione)
);

create index if not exists documentazioni_versioni_scheda_idx
  on public.documentazioni_versioni (documentazione_id, versione desc)
  where deleted_at is null;

comment on table public.documentazioni_versioni is
  'Istantanee delle versioni scadute/sostituite. Restano collegate alla stessa scheda.';

drop trigger if exists documentazioni_aziendali_updated_at on public.documentazioni_aziendali;
create trigger documentazioni_aziendali_updated_at
  before update on public.documentazioni_aziendali
  for each row execute function public.set_updated_at();

drop trigger if exists documentazioni_file_updated_at on public.documentazioni_file;
create trigger documentazioni_file_updated_at
  before update on public.documentazioni_file
  for each row execute function public.set_updated_at();

drop trigger if exists documentazioni_versioni_updated_at on public.documentazioni_versioni;
create trigger documentazioni_versioni_updated_at
  before update on public.documentazioni_versioni
  for each row execute function public.set_updated_at();

alter table public.documentazioni_aziendali enable row level security;
alter table public.documentazioni_file enable row level security;
alter table public.documentazioni_versioni enable row level security;

drop policy if exists documentazioni_aziendali_select on public.documentazioni_aziendali;
create policy documentazioni_aziendali_select
  on public.documentazioni_aziendali for select to authenticated
  using (public.is_superadmin());

drop policy if exists documentazioni_aziendali_insert on public.documentazioni_aziendali;
create policy documentazioni_aziendali_insert
  on public.documentazioni_aziendali for insert to authenticated
  with check (public.is_superadmin());

drop policy if exists documentazioni_aziendali_update on public.documentazioni_aziendali;
create policy documentazioni_aziendali_update
  on public.documentazioni_aziendali for update to authenticated
  using (public.is_superadmin())
  with check (public.is_superadmin());

drop policy if exists documentazioni_file_select on public.documentazioni_file;
create policy documentazioni_file_select
  on public.documentazioni_file for select to authenticated
  using (public.is_superadmin());

drop policy if exists documentazioni_file_insert on public.documentazioni_file;
create policy documentazioni_file_insert
  on public.documentazioni_file for insert to authenticated
  with check (public.is_superadmin());

drop policy if exists documentazioni_file_update on public.documentazioni_file;
create policy documentazioni_file_update
  on public.documentazioni_file for update to authenticated
  using (public.is_superadmin())
  with check (public.is_superadmin());

drop policy if exists documentazioni_versioni_select on public.documentazioni_versioni;
create policy documentazioni_versioni_select
  on public.documentazioni_versioni for select to authenticated
  using (public.is_superadmin());

drop policy if exists documentazioni_versioni_insert on public.documentazioni_versioni;
create policy documentazioni_versioni_insert
  on public.documentazioni_versioni for insert to authenticated
  with check (public.is_superadmin());

drop policy if exists documentazioni_versioni_update on public.documentazioni_versioni;
create policy documentazioni_versioni_update
  on public.documentazioni_versioni for update to authenticated
  using (public.is_superadmin())
  with check (public.is_superadmin());

grant select, insert, update on table public.documentazioni_aziendali to authenticated;
grant select, insert, update on table public.documentazioni_file to authenticated;
grant select, insert, update on table public.documentazioni_versioni to authenticated;
grant all on table public.documentazioni_aziendali to postgres, service_role;
grant all on table public.documentazioni_file to postgres, service_role;
grant all on table public.documentazioni_versioni to postgres, service_role;
revoke delete on table public.documentazioni_aziendali from authenticated;
revoke delete on table public.documentazioni_file from authenticated;
revoke delete on table public.documentazioni_versioni from authenticated;

grant usage, select on sequence public.documentazioni_aziendali_codice_seq to authenticated, service_role;
grant execute on function public.next_documentazione_codice() to authenticated, service_role;

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'documentazioni-aziendali',
  'documentazioni-aziendali',
  false,
  15728640,
  array[
    'application/pdf',
    'image/jpeg',
    'image/png',
    'image/webp'
  ]::text[]
)
on conflict (id) do update set
  public = excluded.public,
  file_size_limit = excluded.file_size_limit,
  allowed_mime_types = excluded.allowed_mime_types;

drop policy if exists documentazioni_storage_select on storage.objects;
create policy documentazioni_storage_select
  on storage.objects for select to authenticated
  using (
    bucket_id = 'documentazioni-aziendali'
    and public.is_superadmin()
  );

drop policy if exists documentazioni_storage_insert on storage.objects;
create policy documentazioni_storage_insert
  on storage.objects for insert to authenticated
  with check (
    bucket_id = 'documentazioni-aziendali'
    and public.is_superadmin()
  );

drop policy if exists documentazioni_storage_update on storage.objects;
create policy documentazioni_storage_update
  on storage.objects for update to authenticated
  using (
    bucket_id = 'documentazioni-aziendali'
    and public.is_superadmin()
  )
  with check (
    bucket_id = 'documentazioni-aziendali'
    and public.is_superadmin()
  );
