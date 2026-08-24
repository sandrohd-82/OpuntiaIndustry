-- Contratti fiscali (affitto, noleggio, ecc.) — Area Fiscale
-- ISO 9001: audit, soft delete, stati/versioni, RLS

create table if not exists public.contratti_fiscali (
  id uuid primary key default gen_random_uuid(),
  tipologia text not null
    check (tipologia in ('affitto', 'noleggio', 'leasing', 'servizio', 'altro')),
  oggetto text not null,
  controparte_nome text not null default '',
  anagrafica_id uuid,
  importo numeric(14, 2) not null check (importo >= 0),
  valuta text not null default 'EUR',
  periodicita text not null default 'mensile'
    check (periodicita in ('una_tantum', 'mensile', 'trimestrale', 'annuale')),
  iva_percentuale numeric(5, 2),
  -- Periodo temporale
  ha_periodo boolean not null default true,
  data_inizio date,
  data_fine date,
  a_tempo_indeterminato boolean not null default false,
  -- Rapporto con fattura (mutuamente esclusivi)
  sostituisce_fattura boolean not null default false,
  pagamento_soggetto_a_fattura boolean not null default false,
  note text not null default '',
  allegato_path text,
  allegato_nome text,
  -- Documento ISO
  stato text not null default 'bozza'
    check (stato in ('bozza', 'attivo', 'scaduto', 'archiviato')),
  versione integer not null default 1 check (versione >= 1),
  approved_at timestamptz,
  approved_by uuid references auth.users (id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  created_by uuid references auth.users (id) on delete set null,
  updated_by uuid references auth.users (id) on delete set null,
  deleted_at timestamptz,
  deleted_by uuid references auth.users (id) on delete set null,
  constraint contratti_fiscali_oggetto_len check (
    char_length(trim(oggetto)) >= 1 and char_length(oggetto) <= 300
  ),
  constraint contratti_fiscali_fattura_xor check (
    (sostituisce_fattura and not pagamento_soggetto_a_fattura)
    or (not sostituisce_fattura and pagamento_soggetto_a_fattura)
  ),
  constraint contratti_fiscali_periodo_check check (
    (
      ha_periodo = false
      and data_inizio is null
      and data_fine is null
    )
    or (
      ha_periodo = true
      and data_inizio is not null
      and (
        a_tempo_indeterminato = true
        or (data_fine is not null and data_fine >= data_inizio)
      )
    )
  )
);

create index if not exists contratti_fiscali_stato_idx
  on public.contratti_fiscali (stato, updated_at desc)
  where deleted_at is null;

create index if not exists contratti_fiscali_periodo_idx
  on public.contratti_fiscali (data_inizio, data_fine)
  where deleted_at is null and ha_periodo = true;

drop trigger if exists contratti_fiscali_updated_at on public.contratti_fiscali;
create trigger contratti_fiscali_updated_at
  before update on public.contratti_fiscali
  for each row execute function public.set_updated_at();

comment on table public.contratti_fiscali is
  'Contratti Area Fiscale (affitto/noleggio/…) con periodo e flag fattura — ISO 9001.';

alter table public.contratti_fiscali enable row level security;

drop policy if exists "contratti_fiscali_select" on public.contratti_fiscali;
create policy "contratti_fiscali_select"
  on public.contratti_fiscali for select to authenticated
  using (
    deleted_at is null
    and (public.has_area_access('area-fiscale') or public.is_superadmin())
  );

drop policy if exists "contratti_fiscali_insert" on public.contratti_fiscali;
create policy "contratti_fiscali_insert"
  on public.contratti_fiscali for insert to authenticated
  with check (
    public.has_area_access('area-fiscale') or public.is_superadmin()
  );

drop policy if exists "contratti_fiscali_update" on public.contratti_fiscali;
create policy "contratti_fiscali_update"
  on public.contratti_fiscali for update to authenticated
  using (public.has_area_access('area-fiscale') or public.is_superadmin())
  with check (public.has_area_access('area-fiscale') or public.is_superadmin());

grant select, insert, update on public.contratti_fiscali to authenticated;
grant all on public.contratti_fiscali to postgres, service_role;
revoke delete on public.contratti_fiscali from authenticated;

-- Allegati PDF contratto
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'contratti-fiscali',
  'contratti-fiscali',
  false,
  20971520,
  array[
    'application/pdf',
    'image/jpeg',
    'image/png',
    'application/msword',
    'application/vnd.openxmlformats-officedocument.wordprocessingml.document'
  ]::text[]
)
on conflict (id) do update set
  public = excluded.public,
  file_size_limit = excluded.file_size_limit,
  allowed_mime_types = excluded.allowed_mime_types;

drop policy if exists "contratti_fiscali_storage_select" on storage.objects;
create policy "contratti_fiscali_storage_select"
  on storage.objects for select to authenticated
  using (
    bucket_id = 'contratti-fiscali'
    and (public.has_area_access('area-fiscale') or public.is_superadmin())
  );

drop policy if exists "contratti_fiscali_storage_insert" on storage.objects;
create policy "contratti_fiscali_storage_insert"
  on storage.objects for insert to authenticated
  with check (
    bucket_id = 'contratti-fiscali'
    and (public.has_area_access('area-fiscale') or public.is_superadmin())
  );

drop policy if exists "contratti_fiscali_storage_update" on storage.objects;
create policy "contratti_fiscali_storage_update"
  on storage.objects for update to authenticated
  using (
    bucket_id = 'contratti-fiscali'
    and (public.has_area_access('area-fiscale') or public.is_superadmin())
  )
  with check (
    bucket_id = 'contratti-fiscali'
    and (public.has_area_access('area-fiscale') or public.is_superadmin())
  );
