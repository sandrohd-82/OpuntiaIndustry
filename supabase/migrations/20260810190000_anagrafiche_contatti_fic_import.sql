-- Contatti anagrafiche + scarti import FiC (ISO 9001: tracciabilità, no auto-save)

-- ---------------------------------------------------------------------------
-- Contatti su fornitori / clienti
-- ---------------------------------------------------------------------------
alter table public.fornitori
  add column if not exists email text not null default '',
  add column if not exists pec text not null default '',
  add column if not exists sdi_code text not null default '',
  add column if not exists telefono text not null default '';

alter table public.clienti
  add column if not exists email text not null default '',
  add column if not exists pec text not null default '',
  add column if not exists sdi_code text not null default '',
  add column if not exists telefono text not null default '';

comment on column public.fornitori.email is 'Email ordinaria';
comment on column public.fornitori.pec is 'PEC';
comment on column public.fornitori.sdi_code is 'Codice destinatario SDI';
comment on column public.fornitori.telefono is 'Telefono';
comment on column public.clienti.email is 'Email ordinaria';
comment on column public.clienti.pec is 'PEC';
comment on column public.clienti.sdi_code is 'Codice destinatario SDI';
comment on column public.clienti.telefono is 'Telefono';

-- ---------------------------------------------------------------------------
-- Scarti import (non ripresentare in sync future)
-- ---------------------------------------------------------------------------
create table if not exists public.fic_import_discarded (
  id uuid primary key default gen_random_uuid(),
  entity_kind text not null,
  fic_entity_id bigint not null,
  entity_name text not null default '',
  vat_number text not null default '',
  note text not null default '',
  created_by uuid references auth.users (id) on delete set null,
  created_at timestamptz not null default now(),
  constraint fic_import_discarded_kind_check check (
    entity_kind in ('supplier', 'client')
  )
);

comment on table public.fic_import_discarded is
  'Anagrafiche FiC scartate in revisione import — non riproposte (ISO 8.5.2)';

create unique index if not exists fic_import_discarded_kind_fic_uidx
  on public.fic_import_discarded (entity_kind, fic_entity_id);

create index if not exists fic_import_discarded_created_at_idx
  on public.fic_import_discarded (created_at desc);

alter table public.fic_import_discarded enable row level security;

drop policy if exists "fic_import_discarded_select_amm" on public.fic_import_discarded;
create policy "fic_import_discarded_select_amm"
  on public.fic_import_discarded for select
  to authenticated
  using (public.has_area_access('amministrazione') or public.is_superadmin());

drop policy if exists "fic_import_discarded_insert_amm" on public.fic_import_discarded;
create policy "fic_import_discarded_insert_amm"
  on public.fic_import_discarded for insert
  to authenticated
  with check (public.has_area_access('amministrazione') or public.is_superadmin());

-- UPDATE necessario per upsert (Scarta due volte / ripresa): nessun DELETE
drop policy if exists "fic_import_discarded_update_amm" on public.fic_import_discarded;
create policy "fic_import_discarded_update_amm"
  on public.fic_import_discarded for update
  to authenticated
  using (public.has_area_access('amministrazione') or public.is_superadmin())
  with check (public.has_area_access('amministrazione') or public.is_superadmin());

grant select, insert, update on table public.fic_import_discarded to authenticated;
grant all on table public.fic_import_discarded to postgres, service_role;
