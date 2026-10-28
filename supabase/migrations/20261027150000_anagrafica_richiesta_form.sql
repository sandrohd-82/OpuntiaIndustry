-- Form pubblico anagrafica: salvataggio a ogni campo, PDF e documento firmato.
-- Il link vale 7 giorni. Il PDF generato e quello firmato non si cancellano.

alter table public.clienti
  add column if not exists banca_appoggio text not null default '',
  add column if not exists banca_filiale text not null default '',
  add column if not exists banca_iban text not null default '',
  add column if not exists resp_acquisti_nome text not null default '',
  add column if not exists resp_acquisti_tel text not null default '',
  add column if not exists resp_acquisti_email text not null default '',
  add column if not exists resp_tecnico_nome text not null default '',
  add column if not exists resp_tecnico_tel text not null default '',
  add column if not exists resp_tecnico_email text not null default '',
  add column if not exists titolare_cognome text not null default '',
  add column if not exists titolare_nome text not null default '',
  add column if not exists titolare_codice_fiscale text not null default '',
  add column if not exists titolare_documento_tipo text not null default '',
  add column if not exists titolare_documento_numero text not null default '';

alter table public.clienti_possibili
  add column if not exists banca_appoggio text not null default '',
  add column if not exists banca_filiale text not null default '',
  add column if not exists banca_iban text not null default '',
  add column if not exists resp_acquisti_nome text not null default '',
  add column if not exists resp_acquisti_tel text not null default '',
  add column if not exists resp_acquisti_email text not null default '',
  add column if not exists resp_tecnico_nome text not null default '',
  add column if not exists resp_tecnico_tel text not null default '',
  add column if not exists resp_tecnico_email text not null default '',
  add column if not exists titolare_cognome text not null default '',
  add column if not exists titolare_nome text not null default '',
  add column if not exists titolare_codice_fiscale text not null default '',
  add column if not exists titolare_documento_tipo text not null default '',
  add column if not exists titolare_documento_numero text not null default '';

alter table public.anagrafica_sedi
  add column if not exists telefono text not null default '';

alter table public.anagrafica_documenti
  drop constraint if exists anagrafica_documenti_tipo_check;

alter table public.anagrafica_documenti
  add constraint anagrafica_documenti_tipo_check
  check (
    tipo in (
      'contratto',
      'concordato',
      'meeting_resume',
      'nda',
      'altro',
      'anagrafica_aziendale'
    )
  );

create table if not exists public.anagrafica_richieste (
  id uuid primary key default gen_random_uuid(),
  token_hash text not null,
  cliente_id uuid references public.clienti (id),
  cliente_possibile_id uuid references public.clienti_possibili (id),
  email_destinatario text not null default '',
  stato text not null default 'compilazione',
  scade_at timestamptz not null,
  payload jsonb not null default '{}'::jsonb,
  pdf_storage_path text not null default '',
  pdf_file_name text not null default '',
  firmato_storage_path text not null default '',
  firmato_file_name text not null default '',
  compilata_at timestamptz,
  pdf_scaricato_at timestamptz,
  firmata_at timestamptz,
  versione integer not null default 1,
  documento_stato text not null default 'bozza',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  created_by uuid,
  updated_by uuid,
  deleted_at timestamptz,
  deleted_by uuid,
  constraint anagrafica_richieste_owner_check check (
    (cliente_id is not null and cliente_possibile_id is null)
    or (cliente_id is null and cliente_possibile_id is not null)
  ),
  constraint anagrafica_richieste_stato_check check (
    stato in ('compilazione', 'pdf_pronto', 'firmata', 'scaduta', 'annullata')
  ),
  constraint anagrafica_richieste_documento_stato_check check (
    documento_stato in ('bozza', 'approvato', 'chiuso')
  )
);

create unique index if not exists anagrafica_richieste_token_hash_uidx
  on public.anagrafica_richieste (token_hash)
  where deleted_at is null;

create index if not exists anagrafica_richieste_cliente_idx
  on public.anagrafica_richieste (cliente_id)
  where deleted_at is null and cliente_id is not null;

create index if not exists anagrafica_richieste_possibile_idx
  on public.anagrafica_richieste (cliente_possibile_id)
  where deleted_at is null and cliente_possibile_id is not null;

drop trigger if exists set_anagrafica_richieste_updated_at on public.anagrafica_richieste;
create trigger set_anagrafica_richieste_updated_at
  before update on public.anagrafica_richieste
  for each row execute function public.set_updated_at();

alter table public.anagrafica_richieste enable row level security;

drop policy if exists anagrafica_richieste_select on public.anagrafica_richieste;
create policy anagrafica_richieste_select on public.anagrafica_richieste
  for select to authenticated
  using (
    deleted_at is null
    and (
      public.is_superadmin()
      or public.has_area_access('amministrazione')
      or public.has_area_access('commerciale')
    )
  );

revoke all on table public.anagrafica_richieste from anon;
grant select on table public.anagrafica_richieste to authenticated;
grant all on table public.anagrafica_richieste to service_role;
