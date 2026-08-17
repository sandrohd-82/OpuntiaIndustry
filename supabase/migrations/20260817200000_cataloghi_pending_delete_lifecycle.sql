-- ISO 9001: eliminazione cataloghi acquisti con gate (pending delete) + riapertura documenti

alter table public.catalogo_servizi
  add column if not exists pending_delete_at timestamptz,
  add column if not exists pending_delete_by uuid references auth.users (id) on delete set null;

alter table public.catalogo_prodotti_fornitore
  add column if not exists pending_delete_at timestamptz,
  add column if not exists pending_delete_by uuid references auth.users (id) on delete set null;

alter table public.materie_prime
  add column if not exists pending_delete_at timestamptz,
  add column if not exists pending_delete_by uuid references auth.users (id) on delete set null;

comment on column public.catalogo_servizi.pending_delete_at is
  'Richiesta eliminazione in corso: soft delete consentito solo a riferimenti azzerati.';
comment on column public.catalogo_prodotti_fornitore.pending_delete_at is
  'Richiesta eliminazione in corso: soft delete consentito solo a riferimenti azzerati.';
comment on column public.materie_prime.pending_delete_at is
  'Richiesta eliminazione in corso: soft delete consentito solo a riferimenti azzerati.';

create index if not exists catalogo_servizi_pending_delete_idx
  on public.catalogo_servizi (pending_delete_at)
  where pending_delete_at is not null and deleted_at is null;

create index if not exists catalogo_prodotti_fornitore_pending_delete_idx
  on public.catalogo_prodotti_fornitore (pending_delete_at)
  where pending_delete_at is not null and deleted_at is null;

create index if not exists materie_prime_pending_delete_idx
  on public.materie_prime (pending_delete_at)
  where pending_delete_at is not null and deleted_at is null;
