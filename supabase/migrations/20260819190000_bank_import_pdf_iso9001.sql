-- Import estratto conto PDF → Rapporti Banca (ISO 9001)

create table if not exists public.bank_import_batches (
  id uuid primary key default gen_random_uuid(),
  file_name text not null,
  file_sha256 text not null default '',
  source_type text not null default 'pdf'
    check (source_type in ('pdf', 'csv', 'xlsx', 'manual')),
  documento_stato text not null default 'processato'
    check (documento_stato in ('bozza', 'processato', 'errore', 'annullato')),
  account_name text not null default 'BCC Don Rizzo',
  rows_total integer not null default 0,
  rows_imported integer not null default 0,
  rows_skipped integer not null default 0,
  rows_matched integer not null default 0,
  parse_notes text not null default '',
  raw_text_excerpt text not null default '',
  parser_model text not null default '',
  created_by uuid references auth.users (id) on delete set null,
  updated_by uuid references auth.users (id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz,
  deleted_by uuid references auth.users (id) on delete set null
);

create index if not exists bank_import_batches_created_idx
  on public.bank_import_batches (created_at desc)
  where deleted_at is null;

drop trigger if exists bank_import_batches_updated_at on public.bank_import_batches;
create trigger bank_import_batches_updated_at
  before update on public.bank_import_batches
  for each row execute function public.set_updated_at();

alter table public.bank_import_batches enable row level security;

drop policy if exists "bank_import_batches_all" on public.bank_import_batches;
create policy "bank_import_batches_all"
  on public.bank_import_batches for all to authenticated
  using (
    public.has_area_access('area-fiscale')
    or public.has_area_access('amministrazione')
    or public.is_superadmin()
  )
  with check (
    public.has_area_access('area-fiscale')
    or public.has_area_access('amministrazione')
    or public.is_superadmin()
  );

grant select, insert, update on table public.bank_import_batches to authenticated;
grant all on table public.bank_import_batches to postgres, service_role;
revoke delete on table public.bank_import_batches from authenticated;

alter table public.bank_transactions
  add column if not exists source text not null default 'fic_cashbook'
    check (source in ('fic_cashbook', 'fic_docpay', 'bank_pdf', 'bank_csv', 'manual'));

alter table public.bank_transactions
  add column if not exists import_batch_id uuid
    references public.bank_import_batches (id) on delete set null;

alter table public.bank_transactions
  add column if not exists line_hash text;

create index if not exists bank_transactions_batch_idx
  on public.bank_transactions (import_batch_id)
  where deleted_at is null;

create unique index if not exists bank_transactions_line_hash_uidx
  on public.bank_transactions (line_hash)
  where deleted_at is null and line_hash is not null and line_hash <> '';

comment on table public.bank_import_batches is
  'Lotti di import estratto conto (PDF) — audit ISO 9001';
comment on column public.bank_transactions.source is
  'Origine movimento: FiC cashbook/docpay oppure file banca';
