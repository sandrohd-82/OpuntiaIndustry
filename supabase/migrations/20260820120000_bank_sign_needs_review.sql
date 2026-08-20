-- Segno da confermare operatore (ISO 9001: nessun drop silenzioso delle voci dubbie)

alter table public.bank_transactions
  add column if not exists sign_needs_review boolean not null default false;

comment on column public.bank_transactions.sign_needs_review is
  'true = operatore deve scegliere +/−; la voce resta importata';

create index if not exists bank_transactions_sign_review_idx
  on public.bank_transactions (sign_needs_review)
  where deleted_at is null and sign_needs_review = true;
