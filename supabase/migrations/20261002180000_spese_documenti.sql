-- Gestione spese, scontrini e fatture fuori SDI (ISO 9001 7.5 / 8.5.2 / 6.1).
-- Il documento vive da solo. Il progetto o la trasferta è un collegamento facoltativo.
-- Nessuna prima nota: la contabilizzazione è uno stato tracciato in audit.

create table if not exists public.spese_progetti (
  id uuid primary key default gen_random_uuid(),
  tipo text not null check (tipo in ('progetto', 'trasferta')),
  titolo text not null,
  descrizione text not null default '',
  data_inizio date not null,
  data_fine date,
  documento_stato text not null default 'bozza'
    check (documento_stato in ('bozza', 'approvato', 'chiuso')),
  versione integer not null default 1,
  approved_by uuid references auth.users (id) on delete set null,
  approved_at timestamptz,
  created_by uuid references auth.users (id) on delete set null,
  updated_by uuid references auth.users (id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz,
  deleted_by uuid references auth.users (id) on delete set null,
  constraint spese_progetti_date_check
    check (data_fine is null or data_fine >= data_inizio)
);

create index if not exists spese_progetti_data_idx
  on public.spese_progetti (data_inizio desc)
  where deleted_at is null;

comment on table public.spese_progetti is
  'Progetti e trasferte a cui si possono agganciare spese già registrate.';

drop trigger if exists spese_progetti_updated_at on public.spese_progetti;
create trigger spese_progetti_updated_at
  before update on public.spese_progetti
  for each row execute function public.set_updated_at();

create table if not exists public.spese_documenti (
  id uuid primary key default gen_random_uuid(),
  tipo_caricamento text not null
    check (tipo_caricamento in ('scontrino', 'fattura_estera', 'xml')),
  categoria text not null
    check (categoria in (
      'vitto',
      'alloggio',
      'trasporti',
      'carburante_automezzi',
      'carburante_impianti',
      'cancelleria',
      'ufficio',
      'altro'
    )),
  modalita_pagamento text not null
    check (modalita_pagamento in (
      'anticipo_dipendente',
      'carta_aziendale',
      'conto_aziendale'
    )),
  esercente text not null,
  partita_iva text not null default '',
  data_documento date not null,
  giustificazione text not null default '',
  imponibile numeric(14, 2) not null,
  aliquota_iva numeric(5, 2) not null default 0,
  imposta numeric(14, 2) not null default 0,
  totale numeric(14, 2) not null,
  valuta text not null default 'EUR',
  importo_valuta numeric(14, 2),
  cambio numeric(14, 6),
  nazione text not null default '',
  flag_esterometro boolean not null default false,
  tipo_autofattura text not null default ''
    check (tipo_autofattura in ('', 'TD17', 'TD18')),
  progetto_id uuid references public.spese_progetti (id),
  stato text not null default 'registrato'
    check (stato in ('bozza', 'registrato', 'contabilizzato', 'annullato')),
  versione integer not null default 1,
  storage_path text not null,
  file_name text not null default '',
  mime text not null default '',
  lettura_automatica boolean not null default false,
  note text not null default '',
  contabilizzato_at timestamptz,
  contabilizzato_by uuid references auth.users (id) on delete set null,
  created_by uuid references auth.users (id) on delete set null,
  updated_by uuid references auth.users (id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz,
  deleted_by uuid references auth.users (id) on delete set null,
  constraint spese_documenti_importi_check check (
    imponibile >= 0
    and imposta >= 0
    and totale >= 0
    and aliquota_iva >= 0
    and aliquota_iva <= 100
    and (importo_valuta is null or importo_valuta >= 0)
    and (cambio is null or cambio > 0)
    and char_length(valuta) = 3
  ),
  constraint spese_documenti_giustificazione_check check (
    stato = 'bozza'
    or categoria not in ('cancelleria', 'ufficio', 'altro')
    or char_length(trim(giustificazione)) > 0
  ),
  constraint spese_documenti_estero_check check (
    tipo_caricamento <> 'fattura_estera'
    or stato in ('bozza', 'annullato')
    or char_length(trim(nazione)) > 0
  )
);

create index if not exists spese_documenti_data_idx
  on public.spese_documenti (data_documento desc)
  where deleted_at is null;

create index if not exists spese_documenti_progetto_idx
  on public.spese_documenti (progetto_id)
  where deleted_at is null and progetto_id is not null;

comment on table public.spese_documenti is
  'Scontrini, piccole spese e fatture caricate a mano. progetto_id è facoltativo.';

drop trigger if exists spese_documenti_updated_at on public.spese_documenti;
create trigger spese_documenti_updated_at
  before update on public.spese_documenti
  for each row execute function public.set_updated_at();

alter table public.spese_progetti enable row level security;
alter table public.spese_documenti enable row level security;

drop policy if exists spese_progetti_select on public.spese_progetti;
create policy spese_progetti_select
  on public.spese_progetti for select to authenticated
  using (public.has_area_access('area-fiscale') or public.is_superadmin());

drop policy if exists spese_progetti_insert on public.spese_progetti;
create policy spese_progetti_insert
  on public.spese_progetti for insert to authenticated
  with check (public.has_area_access('area-fiscale') or public.is_superadmin());

drop policy if exists spese_progetti_update on public.spese_progetti;
create policy spese_progetti_update
  on public.spese_progetti for update to authenticated
  using (public.has_area_access('area-fiscale') or public.is_superadmin())
  with check (public.has_area_access('area-fiscale') or public.is_superadmin());

drop policy if exists spese_documenti_select on public.spese_documenti;
create policy spese_documenti_select
  on public.spese_documenti for select to authenticated
  using (public.has_area_access('area-fiscale') or public.is_superadmin());

drop policy if exists spese_documenti_insert on public.spese_documenti;
create policy spese_documenti_insert
  on public.spese_documenti for insert to authenticated
  with check (public.has_area_access('area-fiscale') or public.is_superadmin());

drop policy if exists spese_documenti_update on public.spese_documenti;
create policy spese_documenti_update
  on public.spese_documenti for update to authenticated
  using (public.has_area_access('area-fiscale') or public.is_superadmin())
  with check (public.has_area_access('area-fiscale') or public.is_superadmin());

grant select, insert, update on table public.spese_progetti to authenticated;
grant select, insert, update on table public.spese_documenti to authenticated;
grant all on table public.spese_progetti to postgres, service_role;
grant all on table public.spese_documenti to postgres, service_role;
revoke delete on table public.spese_progetti from authenticated, anon;
revoke delete on table public.spese_documenti from authenticated, anon;

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'spese-documenti',
  'spese-documenti',
  false,
  8388608,
  array[
    'image/jpeg',
    'image/png',
    'image/webp',
    'application/pdf',
    'application/xml',
    'text/xml',
    'application/pkcs7-mime',
    'application/octet-stream'
  ]::text[]
)
on conflict (id) do update set
  public = false,
  file_size_limit = excluded.file_size_limit,
  allowed_mime_types = excluded.allowed_mime_types;

drop policy if exists spese_documenti_storage_select on storage.objects;
create policy spese_documenti_storage_select
  on storage.objects for select to authenticated
  using (
    bucket_id = 'spese-documenti'
    and (public.has_area_access('area-fiscale') or public.is_superadmin())
  );

drop policy if exists spese_documenti_storage_insert on storage.objects;
create policy spese_documenti_storage_insert
  on storage.objects for insert to authenticated
  with check (
    bucket_id = 'spese-documenti'
    and (public.has_area_access('area-fiscale') or public.is_superadmin())
  );
