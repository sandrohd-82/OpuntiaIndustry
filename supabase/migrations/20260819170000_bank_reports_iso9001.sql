-- Rapporti Banca / riconciliazione fiscale — ISO 9001

create table if not exists public.bank_transactions (
  id uuid primary key default gen_random_uuid(),
  fic_payment_id text not null,
  account_name text not null default 'BCC Don Rizzo',
  transaction_date date not null,
  valuta_date date,
  amount numeric(12, 2) not null,
  description text not null default '',
  counterparty_name text not null default '',
  counterparty_vat text not null default '',
  raw_data jsonb not null default '{}'::jsonb,
  created_by uuid references auth.users (id) on delete set null,
  updated_by uuid references auth.users (id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz,
  deleted_by uuid references auth.users (id) on delete set null
);

create unique index if not exists bank_transactions_fic_payment_uidx
  on public.bank_transactions (fic_payment_id)
  where deleted_at is null;

create index if not exists bank_transactions_date_idx
  on public.bank_transactions (transaction_date desc)
  where deleted_at is null;

drop trigger if exists bank_transactions_updated_at on public.bank_transactions;
create trigger bank_transactions_updated_at
  before update on public.bank_transactions
  for each row execute function public.set_updated_at();

alter table public.bank_transactions enable row level security;

drop policy if exists "bank_transactions_all" on public.bank_transactions;
create policy "bank_transactions_all"
  on public.bank_transactions for all to authenticated
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

grant select, insert, update on table public.bank_transactions to authenticated;
grant all on table public.bank_transactions to postgres, service_role;
revoke delete on table public.bank_transactions from authenticated;

create table if not exists public.bank_invoice_matches (
  id uuid primary key default gen_random_uuid(),
  transaction_id uuid not null references public.bank_transactions (id) on delete cascade,
  invoice_id uuid not null references public.fic_invoices (id) on delete cascade,
  match_score integer not null default 0
    check (match_score >= 0 and match_score <= 100),
  status text not null default 'auto_matched'
    check (status in ('auto_matched', 'manually_verified', 'discrepancy')),
  created_by uuid references auth.users (id) on delete set null,
  verified_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz,
  deleted_by uuid references auth.users (id) on delete set null
);

create unique index if not exists bank_invoice_matches_pair_uidx
  on public.bank_invoice_matches (transaction_id, invoice_id)
  where deleted_at is null;

create index if not exists bank_invoice_matches_tx_idx
  on public.bank_invoice_matches (transaction_id)
  where deleted_at is null;

drop trigger if exists bank_invoice_matches_updated_at on public.bank_invoice_matches;
create trigger bank_invoice_matches_updated_at
  before update on public.bank_invoice_matches
  for each row execute function public.set_updated_at();

alter table public.bank_invoice_matches enable row level security;

drop policy if exists "bank_invoice_matches_all" on public.bank_invoice_matches;
create policy "bank_invoice_matches_all"
  on public.bank_invoice_matches for all to authenticated
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

grant select, insert, update on table public.bank_invoice_matches to authenticated;
grant all on table public.bank_invoice_matches to postgres, service_role;
revoke delete on table public.bank_invoice_matches from authenticated;

comment on table public.bank_transactions is
  'Movimenti bancari da FiC cashbook / TS Pay (BCC Don Rizzo) — soft delete ISO 9001';
comment on table public.bank_invoice_matches is
  'Riconciliazione movimento ↔ fattura FiC locale';
