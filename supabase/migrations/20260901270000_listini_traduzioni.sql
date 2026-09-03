-- Testi tradotti delle versioni lingua (ISO 9001 7.5 / 8.5.2).
-- Soft delete + audit. Mai delete fisico.

create table if not exists public.listini_traduzioni (
  id uuid primary key default gen_random_uuid(),
  listino_id uuid not null references public.listini (id),
  kind text not null check (kind in ('listino_nome', 'prodotto', 'imballaggio')),
  source_id uuid,
  testo_origine text not null default '',
  testo_tradotto text not null default '',
  locale text not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  created_by uuid references auth.users (id) on delete set null,
  updated_by uuid references auth.users (id) on delete set null,
  deleted_at timestamptz,
  deleted_by uuid references auth.users (id) on delete set null
);

create unique index if not exists listini_traduzioni_uidx
  on public.listini_traduzioni (
    listino_id,
    kind,
    coalesce(source_id, '00000000-0000-0000-0000-000000000000')
  )
  where deleted_at is null;

create index if not exists listini_traduzioni_listino_idx
  on public.listini_traduzioni (listino_id)
  where deleted_at is null;

drop trigger if exists listini_traduzioni_updated_at on public.listini_traduzioni;
create trigger listini_traduzioni_updated_at
  before update on public.listini_traduzioni
  for each row execute function public.set_updated_at();

alter table public.listini_traduzioni enable row level security;

drop policy if exists listini_traduzioni_select_amm on public.listini_traduzioni;
create policy listini_traduzioni_select_amm
  on public.listini_traduzioni for select to authenticated
  using (public.has_area_access('amministrazione') or public.is_superadmin());

drop policy if exists listini_traduzioni_insert_amm on public.listini_traduzioni;
create policy listini_traduzioni_insert_amm
  on public.listini_traduzioni for insert to authenticated
  with check (public.has_area_access('amministrazione') or public.is_superadmin());

drop policy if exists listini_traduzioni_update_amm on public.listini_traduzioni;
create policy listini_traduzioni_update_amm
  on public.listini_traduzioni for update to authenticated
  using (public.has_area_access('amministrazione') or public.is_superadmin())
  with check (public.has_area_access('amministrazione') or public.is_superadmin());

grant select, insert, update on table public.listini_traduzioni to authenticated;

comment on table public.listini_traduzioni is
  'Traduzioni persistite per versioni lingua del listino (nome documento, prodotti, tipo conf.).';
