-- Collegamenti @ sulle attività Pn — ISO 9001 §8.5.2
-- Token nel testo + riga strutturata, soft delete, audit.

create table if not exists public.pn_attivita_collegamenti (
  id uuid primary key default gen_random_uuid(),
  attivita_id uuid not null references public.pn_attivita (id) on delete cascade,
  kind text not null
    check (
      kind in (
        'operatore',
        'fornitore',
        'rubrica',
        'materia_prima',
        'servizio',
        'prodotto',
        'prodotto_agrinsicilia',
        'cliente',
        'cliente_possibile',
        'preventivo',
        'ordine',
        'campionatura',
        'mail'
      )
    ),
  entity_id uuid not null,
  entity_label text not null default '',
  token text not null,
  meta jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  created_by uuid references auth.users (id) on delete set null,
  updated_by uuid references auth.users (id) on delete set null,
  deleted_at timestamptz,
  deleted_by uuid references auth.users (id) on delete set null,
  constraint pn_attivita_collegamenti_token_len check (
    char_length(trim(token)) >= 2 and char_length(token) <= 240
  )
);

create unique index if not exists pn_attivita_collegamenti_open_uidx
  on public.pn_attivita_collegamenti (attivita_id, kind, entity_id)
  where deleted_at is null;

create index if not exists pn_attivita_collegamenti_attivita_idx
  on public.pn_attivita_collegamenti (attivita_id)
  where deleted_at is null;

drop trigger if exists pn_attivita_collegamenti_updated_at
  on public.pn_attivita_collegamenti;
create trigger pn_attivita_collegamenti_updated_at
  before update on public.pn_attivita_collegamenti
  for each row execute function public.set_updated_at();

comment on table public.pn_attivita_collegamenti is
  'Collegamenti @ in descrizione attività Pn — ISO 9001 §8.5.2';

alter table public.pn_attivita_collegamenti enable row level security;

drop policy if exists "pn_attivita_collegamenti_all"
  on public.pn_attivita_collegamenti;
create policy "pn_attivita_collegamenti_all"
  on public.pn_attivita_collegamenti
  for all to authenticated
  using (public.has_area_access('promemorie-e-note') or public.is_superadmin())
  with check (public.has_area_access('promemorie-e-note') or public.is_superadmin());

grant select, insert, update on public.pn_attivita_collegamenti to authenticated;
grant all on public.pn_attivita_collegamenti to postgres, service_role;
revoke delete on public.pn_attivita_collegamenti from authenticated;
