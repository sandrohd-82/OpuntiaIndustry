-- Unità di misura dell'acquisto. Le sigle di base stanno nel programma;
-- quelle aggiunte da Altro restano in questa tabella. Sull'acquisto si copia la sigla.

alter table public.caveau_siti_acquisti
  add column if not exists unita_misura text not null default '';

create table if not exists public.caveau_unita_misura (
  id uuid primary key default gen_random_uuid(),
  sigla text not null,
  versione integer not null default 1,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  created_by uuid,
  updated_by uuid,
  deleted_at timestamptz,
  deleted_by uuid,
  constraint caveau_unita_sigla_non_vuota check (char_length(btrim(sigla)) > 0),
  constraint caveau_unita_versione_positiva check (versione >= 1)
);

create unique index if not exists caveau_unita_misura_sigla_idx
  on public.caveau_unita_misura (lower(sigla))
  where deleted_at is null;

drop trigger if exists caveau_unita_misura_set_updated_at on public.caveau_unita_misura;
create trigger caveau_unita_misura_set_updated_at
  before update on public.caveau_unita_misura
  for each row execute function public.set_updated_at();

alter table public.caveau_unita_misura enable row level security;

revoke all on table public.caveau_unita_misura from anon, authenticated;
grant select, insert, update, delete on table public.caveau_unita_misura to service_role;

notify pgrst, 'reload schema';

comment on table public.caveau_unita_misura is
  'Unità di misura aggiunte dal Super Admin per gli acquisti dei siti. Accesso solo via service role.';
