-- Fatture interne (emesse/ricevute) + purge cache FiC di test
-- ISO 9001: audit, soft delete, RLS, allegato ricevuta, numero interno Ft-AA-TARGA/N

-- ---------------------------------------------------------------------------
-- Step 1A: purge definitiva fatture cache di test (anagrafiche restano)
-- ---------------------------------------------------------------------------
delete from public.fic_invoices;
delete from public.fic_sync_logs;

-- ---------------------------------------------------------------------------
-- fatture_emesse
-- ---------------------------------------------------------------------------
create table if not exists public.fatture_emesse (
  id uuid primary key default gen_random_uuid(),
  numero_interno text not null,
  cliente_id uuid not null references public.clienti (id),
  cliente_ragione_sociale text not null,
  cliente_codice_targa text not null,
  data_emissione date not null,
  numero_documento_esterno text not null default '',
  fic_id bigint,
  spedizione numeric(14, 2) not null default 0,
  imponibile numeric(14, 2) not null default 0,
  iva_percentuale numeric(6, 2) not null default 22,
  imposta numeric(14, 2) not null default 0,
  totale numeric(14, 2) not null default 0,
  stato_pagamento text not null default 'da_pagare',
  ricevuta_storage_path text not null default '',
  ricevuta_file_name text not null default '',
  versione integer not null default 1,
  documento_stato text not null default 'registrata',
  note text not null default '',
  created_by uuid references auth.users (id) on delete set null,
  updated_by uuid references auth.users (id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz,
  deleted_by uuid references auth.users (id) on delete set null,
  constraint fatture_emesse_stato_pagamento_check check (
    stato_pagamento in ('pagato', 'da_pagare')
  ),
  constraint fatture_emesse_documento_stato_check check (
    documento_stato in ('bozza', 'registrata', 'chiusa')
  ),
  constraint fatture_emesse_spedizione_check check (spedizione >= 0),
  constraint fatture_emesse_iva_check check (iva_percentuale >= 0)
);

comment on table public.fatture_emesse is
  'Registrazione storico fatture emesse (non bozza da inviare) — ISO 9001';
comment on column public.fatture_emesse.numero_interno is
  'Formato Ft-AA-TARGA/N (es. Ft-26-C001/1)';
comment on column public.fatture_emesse.fic_id is
  'ID documento FiC se proveniente da sync (univoco se valorizzato)';

create unique index if not exists fatture_emesse_numero_interno_active_uidx
  on public.fatture_emesse (numero_interno)
  where deleted_at is null;

create unique index if not exists fatture_emesse_fic_id_active_uidx
  on public.fatture_emesse (fic_id)
  where deleted_at is null and fic_id is not null;

create index if not exists fatture_emesse_cliente_id_idx
  on public.fatture_emesse (cliente_id)
  where deleted_at is null;

create index if not exists fatture_emesse_data_idx
  on public.fatture_emesse (data_emissione desc)
  where deleted_at is null;

drop trigger if exists fatture_emesse_updated_at on public.fatture_emesse;
create trigger fatture_emesse_updated_at
  before update on public.fatture_emesse
  for each row execute function public.set_updated_at();

alter table public.fatture_emesse enable row level security;

drop policy if exists "fatture_emesse_select_amministrazione" on public.fatture_emesse;
create policy "fatture_emesse_select_amministrazione"
  on public.fatture_emesse for select to authenticated
  using (public.has_area_access('amministrazione') or public.is_superadmin());

drop policy if exists "fatture_emesse_insert_amministrazione" on public.fatture_emesse;
create policy "fatture_emesse_insert_amministrazione"
  on public.fatture_emesse for insert to authenticated
  with check (public.has_area_access('amministrazione') or public.is_superadmin());

drop policy if exists "fatture_emesse_update_amministrazione" on public.fatture_emesse;
create policy "fatture_emesse_update_amministrazione"
  on public.fatture_emesse for update to authenticated
  using (public.has_area_access('amministrazione') or public.is_superadmin())
  with check (public.has_area_access('amministrazione') or public.is_superadmin());

grant select, insert, update on table public.fatture_emesse to authenticated;
grant all on table public.fatture_emesse to postgres, service_role;

-- ---------------------------------------------------------------------------
-- fatture_emesse_righe
-- ---------------------------------------------------------------------------
create table if not exists public.fatture_emesse_righe (
  id uuid primary key default gen_random_uuid(),
  fattura_id uuid not null references public.fatture_emesse (id) on delete cascade,
  prodotto_id uuid references public.prodotti_propri (id) on delete set null,
  codice text not null default '',
  descrizione text not null default '',
  quantita numeric(14, 4) not null default 0,
  prezzo_unitario numeric(14, 4) not null default 0,
  importo numeric(14, 2) not null default 0,
  sort_order integer not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  created_by uuid references auth.users (id) on delete set null,
  updated_by uuid references auth.users (id) on delete set null,
  constraint fatture_emesse_righe_qta_check check (quantita >= 0),
  constraint fatture_emesse_righe_prezzo_check check (prezzo_unitario >= 0)
);

create index if not exists fatture_emesse_righe_fattura_idx
  on public.fatture_emesse_righe (fattura_id, sort_order);

drop trigger if exists fatture_emesse_righe_updated_at on public.fatture_emesse_righe;
create trigger fatture_emesse_righe_updated_at
  before update on public.fatture_emesse_righe
  for each row execute function public.set_updated_at();

alter table public.fatture_emesse_righe enable row level security;

drop policy if exists "fatture_emesse_righe_select" on public.fatture_emesse_righe;
create policy "fatture_emesse_righe_select"
  on public.fatture_emesse_righe for select to authenticated
  using (public.has_area_access('amministrazione') or public.is_superadmin());

drop policy if exists "fatture_emesse_righe_insert" on public.fatture_emesse_righe;
create policy "fatture_emesse_righe_insert"
  on public.fatture_emesse_righe for insert to authenticated
  with check (public.has_area_access('amministrazione') or public.is_superadmin());

drop policy if exists "fatture_emesse_righe_update" on public.fatture_emesse_righe;
create policy "fatture_emesse_righe_update"
  on public.fatture_emesse_righe for update to authenticated
  using (public.has_area_access('amministrazione') or public.is_superadmin())
  with check (public.has_area_access('amministrazione') or public.is_superadmin());

drop policy if exists "fatture_emesse_righe_delete" on public.fatture_emesse_righe;
create policy "fatture_emesse_righe_delete"
  on public.fatture_emesse_righe for delete to authenticated
  using (public.has_area_access('amministrazione') or public.is_superadmin());

grant select, insert, update, delete on table public.fatture_emesse_righe to authenticated;
grant all on table public.fatture_emesse_righe to postgres, service_role;

-- ---------------------------------------------------------------------------
-- fatture_ricevute
-- ---------------------------------------------------------------------------
create table if not exists public.fatture_ricevute (
  id uuid primary key default gen_random_uuid(),
  numero_interno text not null,
  fornitore_id uuid not null references public.fornitori (id),
  fornitore_ragione_sociale text not null,
  fornitore_codice_targa text not null,
  data_emissione date not null,
  numero_documento_esterno text not null default '',
  fic_id bigint,
  spedizione numeric(14, 2) not null default 0,
  imponibile numeric(14, 2) not null default 0,
  iva_percentuale numeric(6, 2) not null default 22,
  imposta numeric(14, 2) not null default 0,
  totale numeric(14, 2) not null default 0,
  stato_pagamento text not null default 'da_pagare',
  ricevuta_storage_path text not null default '',
  ricevuta_file_name text not null default '',
  versione integer not null default 1,
  documento_stato text not null default 'registrata',
  note text not null default '',
  created_by uuid references auth.users (id) on delete set null,
  updated_by uuid references auth.users (id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz,
  deleted_by uuid references auth.users (id) on delete set null,
  constraint fatture_ricevute_stato_pagamento_check check (
    stato_pagamento in ('pagato', 'da_pagare')
  ),
  constraint fatture_ricevute_documento_stato_check check (
    documento_stato in ('bozza', 'registrata', 'chiusa')
  ),
  constraint fatture_ricevute_spedizione_check check (spedizione >= 0),
  constraint fatture_ricevute_iva_check check (iva_percentuale >= 0)
);

comment on table public.fatture_ricevute is
  'Registrazione storico fatture ricevute dai fornitori — ISO 9001';
comment on column public.fatture_ricevute.numero_interno is
  'Formato Ft-AA-TARGA/N (es. Ft-26-F001/1)';

create unique index if not exists fatture_ricevute_numero_interno_active_uidx
  on public.fatture_ricevute (numero_interno)
  where deleted_at is null;

create unique index if not exists fatture_ricevute_fic_id_active_uidx
  on public.fatture_ricevute (fic_id)
  where deleted_at is null and fic_id is not null;

create index if not exists fatture_ricevute_fornitore_id_idx
  on public.fatture_ricevute (fornitore_id)
  where deleted_at is null;

create index if not exists fatture_ricevute_data_idx
  on public.fatture_ricevute (data_emissione desc)
  where deleted_at is null;

drop trigger if exists fatture_ricevute_updated_at on public.fatture_ricevute;
create trigger fatture_ricevute_updated_at
  before update on public.fatture_ricevute
  for each row execute function public.set_updated_at();

alter table public.fatture_ricevute enable row level security;

drop policy if exists "fatture_ricevute_select_amministrazione" on public.fatture_ricevute;
create policy "fatture_ricevute_select_amministrazione"
  on public.fatture_ricevute for select to authenticated
  using (public.has_area_access('amministrazione') or public.is_superadmin());

drop policy if exists "fatture_ricevute_insert_amministrazione" on public.fatture_ricevute;
create policy "fatture_ricevute_insert_amministrazione"
  on public.fatture_ricevute for insert to authenticated
  with check (public.has_area_access('amministrazione') or public.is_superadmin());

drop policy if exists "fatture_ricevute_update_amministrazione" on public.fatture_ricevute;
create policy "fatture_ricevute_update_amministrazione"
  on public.fatture_ricevute for update to authenticated
  using (public.has_area_access('amministrazione') or public.is_superadmin())
  with check (public.has_area_access('amministrazione') or public.is_superadmin());

grant select, insert, update on table public.fatture_ricevute to authenticated;
grant all on table public.fatture_ricevute to postgres, service_role;

-- ---------------------------------------------------------------------------
-- fatture_ricevute_righe
-- ---------------------------------------------------------------------------
create table if not exists public.fatture_ricevute_righe (
  id uuid primary key default gen_random_uuid(),
  fattura_id uuid not null references public.fatture_ricevute (id) on delete cascade,
  prodotto_id uuid references public.prodotti_propri (id) on delete set null,
  codice text not null default '',
  descrizione text not null default '',
  quantita numeric(14, 4) not null default 0,
  prezzo_unitario numeric(14, 4) not null default 0,
  importo numeric(14, 2) not null default 0,
  sort_order integer not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  created_by uuid references auth.users (id) on delete set null,
  updated_by uuid references auth.users (id) on delete set null,
  constraint fatture_ricevute_righe_qta_check check (quantita >= 0),
  constraint fatture_ricevute_righe_prezzo_check check (prezzo_unitario >= 0)
);

create index if not exists fatture_ricevute_righe_fattura_idx
  on public.fatture_ricevute_righe (fattura_id, sort_order);

drop trigger if exists fatture_ricevute_righe_updated_at on public.fatture_ricevute_righe;
create trigger fatture_ricevute_righe_updated_at
  before update on public.fatture_ricevute_righe
  for each row execute function public.set_updated_at();

alter table public.fatture_ricevute_righe enable row level security;

drop policy if exists "fatture_ricevute_righe_select" on public.fatture_ricevute_righe;
create policy "fatture_ricevute_righe_select"
  on public.fatture_ricevute_righe for select to authenticated
  using (public.has_area_access('amministrazione') or public.is_superadmin());

drop policy if exists "fatture_ricevute_righe_insert" on public.fatture_ricevute_righe;
create policy "fatture_ricevute_righe_insert"
  on public.fatture_ricevute_righe for insert to authenticated
  with check (public.has_area_access('amministrazione') or public.is_superadmin());

drop policy if exists "fatture_ricevute_righe_update" on public.fatture_ricevute_righe;
create policy "fatture_ricevute_righe_update"
  on public.fatture_ricevute_righe for update to authenticated
  using (public.has_area_access('amministrazione') or public.is_superadmin())
  with check (public.has_area_access('amministrazione') or public.is_superadmin());

drop policy if exists "fatture_ricevute_righe_delete" on public.fatture_ricevute_righe;
create policy "fatture_ricevute_righe_delete"
  on public.fatture_ricevute_righe for delete to authenticated
  using (public.has_area_access('amministrazione') or public.is_superadmin());

grant select, insert, update, delete on table public.fatture_ricevute_righe to authenticated;
grant all on table public.fatture_ricevute_righe to postgres, service_role;

-- ---------------------------------------------------------------------------
-- Storage ricevute pagamento fatture
-- ---------------------------------------------------------------------------
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'fatture-ricevute-pagamenti',
  'fatture-ricevute-pagamenti',
  false,
  15728640,
  array['application/pdf', 'image/jpeg', 'image/png', 'image/webp']::text[]
)
on conflict (id) do update set
  file_size_limit = excluded.file_size_limit,
  allowed_mime_types = excluded.allowed_mime_types;

drop policy if exists "fatture_ricevute_pag_select" on storage.objects;
create policy "fatture_ricevute_pag_select"
  on storage.objects for select to authenticated
  using (
    bucket_id = 'fatture-ricevute-pagamenti'
    and (public.has_area_access('amministrazione') or public.is_superadmin())
  );

drop policy if exists "fatture_ricevute_pag_insert" on storage.objects;
create policy "fatture_ricevute_pag_insert"
  on storage.objects for insert to authenticated
  with check (
    bucket_id = 'fatture-ricevute-pagamenti'
    and (public.has_area_access('amministrazione') or public.is_superadmin())
  );

drop policy if exists "fatture_ricevute_pag_update" on storage.objects;
create policy "fatture_ricevute_pag_update"
  on storage.objects for update to authenticated
  using (
    bucket_id = 'fatture-ricevute-pagamenti'
    and (public.has_area_access('amministrazione') or public.is_superadmin())
  )
  with check (
    bucket_id = 'fatture-ricevute-pagamenti'
    and (public.has_area_access('amministrazione') or public.is_superadmin())
  );

drop policy if exists "fatture_ricevute_pag_delete" on storage.objects;
create policy "fatture_ricevute_pag_delete"
  on storage.objects for delete to authenticated
  using (
    bucket_id = 'fatture-ricevute-pagamenti'
    and (public.has_area_access('amministrazione') or public.is_superadmin())
  );
