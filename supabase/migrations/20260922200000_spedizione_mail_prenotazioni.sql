-- Prenotazione / invio mail di spedizione (tracking + lettera di via)
-- ISO 9001: audit, soft delete, versione, stato documento.

create table if not exists public.spedizione_mail_prenotazioni (
  id uuid primary key default gen_random_uuid(),
  entity_type text not null,
  entity_id uuid not null,
  stato text not null default 'prenotata',
  documento_stato text not null default 'bozza',
  versione integer not null default 1,
  tracking_url text not null default '',
  lettera_via_path text not null default '',
  lettera_via_name text not null default '',
  allegati jsonb not null default '[]'::jsonb,
  allega_tracking boolean not null default false,
  allega_lettera boolean not null default false,
  allega_file boolean not null default false,
  destinatario_email text not null default '',
  oggetto text not null default '',
  corpo text not null default '',
  account_id uuid,
  prenotata_at timestamptz,
  prenotata_by uuid references auth.users (id) on delete set null,
  inviata_at timestamptz,
  inviata_by uuid references auth.users (id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  created_by uuid references auth.users (id) on delete set null,
  updated_by uuid references auth.users (id) on delete set null,
  deleted_at timestamptz,
  deleted_by uuid references auth.users (id) on delete set null,
  constraint spedizione_mail_entity_type_check check (
    entity_type in ('campionatura', 'ordine')
  ),
  constraint spedizione_mail_stato_check check (
    stato in ('prenotata', 'pronta', 'inviata', 'annullata')
  ),
  constraint spedizione_mail_doc_stato_check check (
    documento_stato in ('bozza', 'approvato', 'chiuso')
  )
);

comment on table public.spedizione_mail_prenotazioni is
  'Bozza/prenotazione mail spedizione (tracking, lettera di via, allegati) — ISO 9001 §7.5 / §8.5.2';

create unique index if not exists spedizione_mail_entity_attiva_uidx
  on public.spedizione_mail_prenotazioni (entity_type, entity_id)
  where deleted_at is null;

create index if not exists spedizione_mail_stato_idx
  on public.spedizione_mail_prenotazioni (stato)
  where deleted_at is null;

drop trigger if exists spedizione_mail_updated_at on public.spedizione_mail_prenotazioni;
create trigger spedizione_mail_updated_at
  before update on public.spedizione_mail_prenotazioni
  for each row execute function public.set_updated_at();

alter table public.spedizione_mail_prenotazioni enable row level security;

drop policy if exists "spedizione_mail_select" on public.spedizione_mail_prenotazioni;
create policy "spedizione_mail_select"
  on public.spedizione_mail_prenotazioni for select to authenticated
  using (
    public.has_area_access('amministrazione')
    or public.has_area_access('produzione')
    or public.has_area_access('webmail')
    or public.is_superadmin()
  );

drop policy if exists "spedizione_mail_write" on public.spedizione_mail_prenotazioni;
create policy "spedizione_mail_write"
  on public.spedizione_mail_prenotazioni for all to authenticated
  using (
    public.has_area_access('amministrazione')
    or public.has_area_access('produzione')
    or public.is_superadmin()
  )
  with check (
    public.has_area_access('amministrazione')
    or public.has_area_access('produzione')
    or public.is_superadmin()
  );

grant select, insert, update on public.spedizione_mail_prenotazioni to authenticated;
grant all on public.spedizione_mail_prenotazioni to postgres, service_role;
revoke delete on public.spedizione_mail_prenotazioni from authenticated;

insert into storage.buckets (id, name, public, file_size_limit)
values ('spedizione-mail', 'spedizione-mail', false, 15728640)
on conflict (id) do update
set file_size_limit = 15728640, public = false;

drop policy if exists spedizione_mail_storage_select on storage.objects;
create policy spedizione_mail_storage_select
  on storage.objects for select to authenticated
  using (
    bucket_id = 'spedizione-mail'
    and (
      public.is_superadmin()
      or public.has_area_access('amministrazione')
      or public.has_area_access('produzione')
      or public.has_area_access('webmail')
    )
  );

drop policy if exists spedizione_mail_storage_insert on storage.objects;
create policy spedizione_mail_storage_insert
  on storage.objects for insert to authenticated
  with check (
    bucket_id = 'spedizione-mail'
    and (
      public.is_superadmin()
      or public.has_area_access('amministrazione')
      or public.has_area_access('produzione')
    )
  );
