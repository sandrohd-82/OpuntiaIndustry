-- Attività: operatori, formazione (Fo), tempo multiplo + opzioni (ISO 9001)

alter table public.attivita
  add column if not exists operatori_necessari integer not null default 1
    check (operatori_necessari >= 0);

alter table public.attivita
  add column if not exists formazione_codice text;

alter table public.attivita
  add column if not exists tempo_multiplo boolean not null default false;

comment on column public.attivita.operatori_necessari is
  'Numero operatori necessari per l''attività';
comment on column public.attivita.formazione_codice is
  'Targa formazione (prefisso Fo). Facoltativa in develop; obbligatoria se env ATTIVITA_FORMAZIONE_OBBLIGATORIA=true';
comment on column public.attivita.tempo_multiplo is
  'Se true, tempo/quantità sono opzioni multiple (attivita_tempo_opzioni)';

create table if not exists public.attivita_tempo_opzioni (
  id uuid primary key default gen_random_uuid(),
  attivita_id uuid not null references public.attivita (id) on delete restrict,
  nome text not null,
  quantita_valore numeric(12, 3) not null check (quantita_valore > 0),
  quantita_unita text not null default 'kg',
  ore integer not null default 0 check (ore >= 0),
  minuti integer not null default 0 check (minuti >= 0 and minuti < 60),
  sort_order integer not null default 0,
  created_by uuid references auth.users (id) on delete set null,
  updated_by uuid references auth.users (id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz,
  deleted_by uuid references auth.users (id) on delete set null,
  constraint attivita_tempo_opzioni_tempo_check check (ore > 0 or minuti > 0)
);

create index if not exists attivita_tempo_opzioni_attivita_idx
  on public.attivita_tempo_opzioni (attivita_id)
  where deleted_at is null;

comment on table public.attivita_tempo_opzioni is
  'Opzioni nominate di tempo/quantità per attività (es. Campionatura, Pallet Bigbag)';

drop trigger if exists attivita_tempo_opzioni_updated_at
  on public.attivita_tempo_opzioni;
create trigger attivita_tempo_opzioni_updated_at
  before update on public.attivita_tempo_opzioni
  for each row execute function public.set_updated_at();

alter table public.attivita_tempo_opzioni enable row level security;
drop policy if exists "attivita_tempo_opzioni_all"
  on public.attivita_tempo_opzioni;
create policy "attivita_tempo_opzioni_all"
  on public.attivita_tempo_opzioni for all to authenticated
  using (public.has_area_access('amministrazione') or public.is_superadmin())
  with check (public.has_area_access('amministrazione') or public.is_superadmin());

grant select, insert, update on table public.attivita_tempo_opzioni
  to authenticated;
grant all on table public.attivita_tempo_opzioni
  to postgres, service_role;
revoke delete on table public.attivita_tempo_opzioni from authenticated;
