-- Fase di test del form anagrafica.
-- I dati si scrivono davvero. Annulla test ripristina la scheda precedente
-- e ritira link e PDF nati durante la prova.

alter table public.anagrafica_richieste
  add column if not exists fase_test boolean not null default false;

create table if not exists public.anagrafica_test_ripristini (
  id uuid primary key default gen_random_uuid(),
  cliente_id uuid references public.clienti (id),
  cliente_possibile_id uuid references public.clienti_possibili (id),
  richiesta_id uuid,
  scheda jsonb not null,
  sedi jsonb not null default '[]'::jsonb,
  stato text not null default 'attivo',
  versione integer not null default 1,
  documento_stato text not null default 'bozza',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  created_by uuid,
  updated_by uuid,
  deleted_at timestamptz,
  deleted_by uuid,
  constraint anagrafica_test_ripristini_owner_check check (
    (cliente_id is not null and cliente_possibile_id is null)
    or (cliente_id is null and cliente_possibile_id is not null)
  ),
  constraint anagrafica_test_ripristini_stato_check check (
    stato in ('attivo', 'ripristinato')
  ),
  constraint anagrafica_test_ripristini_documento_stato_check check (
    documento_stato in ('bozza', 'approvato', 'chiuso')
  )
);

create unique index if not exists anagrafica_test_ripristini_cliente_attivo_uidx
  on public.anagrafica_test_ripristini (cliente_id)
  where deleted_at is null and stato = 'attivo' and cliente_id is not null;

create unique index if not exists anagrafica_test_ripristini_possibile_attivo_uidx
  on public.anagrafica_test_ripristini (cliente_possibile_id)
  where deleted_at is null and stato = 'attivo' and cliente_possibile_id is not null;

drop trigger if exists set_anagrafica_test_ripristini_updated_at on public.anagrafica_test_ripristini;
create trigger set_anagrafica_test_ripristini_updated_at
  before update on public.anagrafica_test_ripristini
  for each row execute function public.set_updated_at();

alter table public.anagrafica_test_ripristini enable row level security;

drop policy if exists anagrafica_test_ripristini_select on public.anagrafica_test_ripristini;
create policy anagrafica_test_ripristini_select on public.anagrafica_test_ripristini
  for select to authenticated
  using (
    deleted_at is null
    and (
      public.is_superadmin()
      or public.has_area_access('amministrazione')
      or public.has_area_access('commerciale')
    )
  );

revoke all on table public.anagrafica_test_ripristini from anon;
grant select on table public.anagrafica_test_ripristini to authenticated;
grant all on table public.anagrafica_test_ripristini to service_role;
