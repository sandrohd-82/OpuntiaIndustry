-- Ordini ISO 9001: tracciabilità, soft delete, audit log, allegati Storage
-- Amministrazione → Ordini (ricevuti / evasi / storico)

-- ---------------------------------------------------------------------------
-- Audit log immutabile (solo INSERT)
-- ---------------------------------------------------------------------------
create table if not exists public.audit_log (
  id uuid primary key default gen_random_uuid(),
  entity_type text not null,
  entity_id uuid not null,
  action text not null,
  actor_id uuid references auth.users (id) on delete set null,
  summary text not null default '',
  payload jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  constraint audit_log_action_check check (
    action in (
      'create',
      'update',
      'soft_delete',
      'restore',
      'status_change',
      'attachment_upload',
      'attachment_remove'
    )
  )
);

comment on table public.audit_log is
  'Registro immutabile operazioni critiche (ISO 9001 §8.5.2)';

create index if not exists audit_log_entity_idx
  on public.audit_log (entity_type, entity_id, created_at desc);
create index if not exists audit_log_created_at_idx
  on public.audit_log (created_at desc);

alter table public.audit_log enable row level security;

drop policy if exists "audit_log_select_amministrazione" on public.audit_log;
create policy "audit_log_select_amministrazione"
  on public.audit_log for select
  to authenticated
  using (public.has_area_access('amministrazione') or public.is_superadmin());

drop policy if exists "audit_log_insert_amministrazione" on public.audit_log;
create policy "audit_log_insert_amministrazione"
  on public.audit_log for insert
  to authenticated
  with check (public.has_area_access('amministrazione') or public.is_superadmin());

-- Nessuna policy UPDATE/DELETE → immutabile via RLS

grant select, insert on table public.audit_log to authenticated;
grant all on table public.audit_log to postgres, service_role;

-- ---------------------------------------------------------------------------
-- Ordini
-- ---------------------------------------------------------------------------
create table if not exists public.ordini (
  id uuid primary key default gen_random_uuid(),
  numero_interno text not null,
  numero_cliente text not null default '',
  cliente_id uuid references public.clienti (id) on delete set null,
  cliente_ragione_sociale text not null,
  cliente_codice_targa text not null,
  data_ordine date not null,
  data_consegna date,
  stato text not null default 'ricevuto',
  origine_storico text,
  source_ordine_id uuid references public.ordini (id) on delete set null,
  trasporto_azienda text not null default '',
  trasporto_imponibile numeric(14, 2) not null default 0,
  trasporto_iva_percentuale numeric(6, 2) not null default 22,
  importo_euro numeric(14, 2) not null default 0,
  note text not null default '',
  offerta_storage_path text not null default '',
  offerta_file_name text not null default '',
  ordine_cliente_storage_path text not null default '',
  ordine_cliente_file_name text not null default '',
  versione integer not null default 1,
  documento_stato text not null default 'registrato',
  created_by uuid references auth.users (id) on delete set null,
  updated_by uuid references auth.users (id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz,
  deleted_by uuid references auth.users (id) on delete set null,
  constraint ordini_stato_check check (
    stato in ('ricevuto', 'evaso', 'storico')
  ),
  constraint ordini_origine_storico_check check (
    origine_storico is null
    or origine_storico in ('manuale', 'chiusura')
  ),
  constraint ordini_documento_stato_check check (
    documento_stato in ('bozza', 'registrato', 'approvato', 'chiuso')
  ),
  constraint ordini_numero_interno_len check (
    char_length(trim(numero_interno)) >= 3
  ),
  constraint ordini_cliente_nome_len check (
    char_length(trim(cliente_ragione_sociale)) >= 1
  ),
  constraint ordini_storico_data_consegna check (
    stato <> 'storico' or data_consegna is not null
  )
);

comment on table public.ordini is
  'Ordini clienti (ricevuti / evasi / storico) — ISO 9001';
comment on column public.ordini.numero_interno is
  'Formato Or-AA-TARGA/N (es. Or-26-C003/391)';
comment on column public.ordini.deleted_at is
  'Soft delete ISO: mai cancellazione fisica dei dati operativi';
comment on column public.ordini.versione is
  'Versione scheda ordine (incrementata a ogni modifica)';
comment on column public.ordini.documento_stato is
  'Stato documentale: bozza | registrato | approvato | chiuso';

create unique index if not exists ordini_numero_interno_active_uidx
  on public.ordini (numero_interno)
  where deleted_at is null;

create index if not exists ordini_stato_idx on public.ordini (stato)
  where deleted_at is null;
create index if not exists ordini_cliente_id_idx on public.ordini (cliente_id)
  where deleted_at is null;
create index if not exists ordini_data_ordine_idx on public.ordini (data_ordine desc);
create index if not exists ordini_created_at_idx on public.ordini (created_at desc);

drop trigger if exists ordini_updated_at on public.ordini;
create trigger ordini_updated_at
  before update on public.ordini
  for each row execute function public.set_updated_at();

alter table public.ordini enable row level security;

drop policy if exists "ordini_select_amministrazione" on public.ordini;
create policy "ordini_select_amministrazione"
  on public.ordini for select
  to authenticated
  using (public.has_area_access('amministrazione') or public.is_superadmin());

drop policy if exists "ordini_insert_amministrazione" on public.ordini;
create policy "ordini_insert_amministrazione"
  on public.ordini for insert
  to authenticated
  with check (public.has_area_access('amministrazione') or public.is_superadmin());

drop policy if exists "ordini_update_amministrazione" on public.ordini;
create policy "ordini_update_amministrazione"
  on public.ordini for update
  to authenticated
  using (public.has_area_access('amministrazione') or public.is_superadmin())
  with check (public.has_area_access('amministrazione') or public.is_superadmin());

-- Nessuna policy DELETE → solo soft delete via UPDATE

grant select, insert, update on table public.ordini to authenticated;
grant all on table public.ordini to postgres, service_role;

-- ---------------------------------------------------------------------------
-- Righe ordine
-- ---------------------------------------------------------------------------
create table if not exists public.ordini_righe (
  id uuid primary key default gen_random_uuid(),
  ordine_id uuid not null references public.ordini (id) on delete cascade,
  prodotto_id uuid references public.prodotti_propri (id) on delete set null,
  prodotto_codice text not null default '',
  prodotto_nome text not null default '',
  quantita numeric(14, 4) not null default 0,
  prezzo_unitario numeric(14, 4) not null default 0,
  iva_percentuale numeric(6, 2) not null default 22,
  sort_order integer not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint ordini_righe_quantita_check check (quantita >= 0),
  constraint ordini_righe_prezzo_check check (prezzo_unitario >= 0),
  constraint ordini_righe_iva_check check (iva_percentuale >= 0)
);

comment on table public.ordini_righe is 'Righe prodotto degli ordini';

create index if not exists ordini_righe_ordine_id_idx
  on public.ordini_righe (ordine_id, sort_order);

drop trigger if exists ordini_righe_updated_at on public.ordini_righe;
create trigger ordini_righe_updated_at
  before update on public.ordini_righe
  for each row execute function public.set_updated_at();

alter table public.ordini_righe enable row level security;

drop policy if exists "ordini_righe_select_amministrazione" on public.ordini_righe;
create policy "ordini_righe_select_amministrazione"
  on public.ordini_righe for select
  to authenticated
  using (public.has_area_access('amministrazione') or public.is_superadmin());

drop policy if exists "ordini_righe_insert_amministrazione" on public.ordini_righe;
create policy "ordini_righe_insert_amministrazione"
  on public.ordini_righe for insert
  to authenticated
  with check (public.has_area_access('amministrazione') or public.is_superadmin());

drop policy if exists "ordini_righe_update_amministrazione" on public.ordini_righe;
create policy "ordini_righe_update_amministrazione"
  on public.ordini_righe for update
  to authenticated
  using (public.has_area_access('amministrazione') or public.is_superadmin())
  with check (public.has_area_access('amministrazione') or public.is_superadmin());

drop policy if exists "ordini_righe_delete_amministrazione" on public.ordini_righe;
create policy "ordini_righe_delete_amministrazione"
  on public.ordini_righe for delete
  to authenticated
  using (public.has_area_access('amministrazione') or public.is_superadmin());

grant select, insert, update, delete on table public.ordini_righe to authenticated;
grant all on table public.ordini_righe to postgres, service_role;

-- ---------------------------------------------------------------------------
-- Storage allegati ordini
-- ---------------------------------------------------------------------------
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'ordini-allegati',
  'ordini-allegati',
  false,
  15728640,
  array['application/pdf', 'image/jpeg', 'image/png', 'image/webp']::text[]
)
on conflict (id) do update set
  file_size_limit = excluded.file_size_limit,
  allowed_mime_types = excluded.allowed_mime_types;

drop policy if exists "ordini_allegati_select_amministrazione" on storage.objects;
create policy "ordini_allegati_select_amministrazione"
  on storage.objects for select
  to authenticated
  using (
    bucket_id = 'ordini-allegati'
    and (public.has_area_access('amministrazione') or public.is_superadmin())
  );

drop policy if exists "ordini_allegati_insert_amministrazione" on storage.objects;
create policy "ordini_allegati_insert_amministrazione"
  on storage.objects for insert
  to authenticated
  with check (
    bucket_id = 'ordini-allegati'
    and (public.has_area_access('amministrazione') or public.is_superadmin())
  );

drop policy if exists "ordini_allegati_update_amministrazione" on storage.objects;
create policy "ordini_allegati_update_amministrazione"
  on storage.objects for update
  to authenticated
  using (
    bucket_id = 'ordini-allegati'
    and (public.has_area_access('amministrazione') or public.is_superadmin())
  )
  with check (
    bucket_id = 'ordini-allegati'
    and (public.has_area_access('amministrazione') or public.is_superadmin())
  );

drop policy if exists "ordini_allegati_delete_amministrazione" on storage.objects;
create policy "ordini_allegati_delete_amministrazione"
  on storage.objects for delete
  to authenticated
  using (
    bucket_id = 'ordini-allegati'
    and (public.has_area_access('amministrazione') or public.is_superadmin())
  );
