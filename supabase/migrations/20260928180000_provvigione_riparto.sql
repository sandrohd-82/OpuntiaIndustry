-- Riparto provvigione: quota che il superiore cede al Professional,
-- e intermediario (Executive) con la sua quota sul singolo cliente.

alter table public.organigramma_persone
  add column if not exists provvigione_quota_superiore_pct numeric(5, 2),
  add column if not exists provvigione_quota_superiore_by uuid;

alter table public.organigramma_persone
  drop constraint if exists organigramma_persone_quota_superiore_chk;

alter table public.organigramma_persone
  add constraint organigramma_persone_quota_superiore_chk
  check (
    provvigione_quota_superiore_pct is null
    or (
      provvigione_quota_superiore_pct >= 0
      and provvigione_quota_superiore_pct <= 100
    )
  );

comment on column public.organigramma_persone.provvigione_quota_superiore_pct is
  'Punti percentuali sull''imponibile che il superiore cede a questo commerciale (es. Senior 30, quota Professional 10).';

comment on column public.organigramma_persone.provvigione_quota_superiore_by is
  'Utente che ha registrato la quota ceduta dal superiore.';

alter table public.clienti
  add column if not exists intermediario_id uuid references auth.users (id) on delete set null,
  add column if not exists intermediario_provvigione_pct numeric(5, 2);

alter table public.clienti
  drop constraint if exists clienti_intermediario_pct_chk;

alter table public.clienti
  add constraint clienti_intermediario_pct_chk
  check (
    intermediario_provvigione_pct is null
    or (
      intermediario_provvigione_pct >= 0
      and intermediario_provvigione_pct <= 100
    )
  );

create index if not exists clienti_intermediario_id_idx
  on public.clienti (intermediario_id);

comment on column public.clienti.intermediario_id is
  'Executive sotto il Professional del cliente: intermediario della vendita.';

comment on column public.clienti.intermediario_provvigione_pct is
  'Punti percentuali sull''imponibile ceduti dal Professional all''intermediario. Non superano la quota del Professional.';
