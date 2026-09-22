-- Catalogo effetti di processo (contratti macchina) + esecuzione sul foglio.
-- ISO 9001: audit, soft delete, versione/stato. Mai delete fisico.

create table if not exists public.produzione_processo_effetti (
  id uuid primary key default gen_random_uuid(),
  processo_id uuid not null
    references public.produzione_processi (id) on delete restrict,
  tipo text not null
    check (tipo in (
      'magazzino.consuma',
      'magazzino.produce',
      'essiccatore.carica_cestone'
    )),
  parametri jsonb not null default '{}'::jsonb,
  note text not null default '',
  sort_order integer not null default 0,
  versione integer not null default 1,
  documento_stato text not null default 'approvato'
    check (documento_stato in ('bozza', 'approvato', 'chiuso')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  created_by uuid references auth.users (id) on delete set null,
  updated_by uuid references auth.users (id) on delete set null,
  deleted_at timestamptz,
  deleted_by uuid references auth.users (id) on delete set null
);

create index if not exists produzione_processo_effetti_processo_idx
  on public.produzione_processo_effetti (processo_id, sort_order)
  where deleted_at is null;

comment on table public.produzione_processo_effetti is
  'Obiettivi macchina di un processo PX: consuma/produce magazzino, carica cestone. Catalogo chiuso di tipi.';

drop trigger if exists produzione_processo_effetti_updated_at
  on public.produzione_processo_effetti;
create trigger produzione_processo_effetti_updated_at
  before update on public.produzione_processo_effetti
  for each row execute function public.set_updated_at();

alter table public.produzione_processo_effetti enable row level security;

drop policy if exists produzione_processo_effetti_all
  on public.produzione_processo_effetti;
create policy produzione_processo_effetti_all
  on public.produzione_processo_effetti for all to authenticated
  using (
    public.has_area_access('produzione')
    or public.has_area_access('amministrazione')
    or public.is_superadmin()
  )
  with check (
    public.has_area_access('produzione')
    or public.has_area_access('amministrazione')
    or public.is_superadmin()
  );

grant select, insert, update on table public.produzione_processo_effetti
  to authenticated;
grant all on table public.produzione_processo_effetti
  to postgres, service_role;
revoke delete on table public.produzione_processo_effetti from authenticated;

-- Esecuzione: previsto → effettivo sul foglio (qty, lotto, essiccatore).
create table if not exists public.produzione_foglio_processo_effetti (
  id uuid primary key default gen_random_uuid(),
  definizione_id uuid
    references public.produzione_processo_effetti (id) on delete set null,
  esecuzione_id uuid not null
    references public.produzione_foglio_processi (id) on delete restrict,
  foglio_id uuid not null
    references public.produzione_fogli_lavorazione (id) on delete restrict,
  processo_id uuid not null
    references public.produzione_processi (id) on delete restrict,
  tipo text not null
    check (tipo in (
      'magazzino.consuma',
      'magazzino.produce',
      'essiccatore.carica_cestone'
    )),
  parametri jsonb not null default '{}'::jsonb,
  qty_prevista numeric(14, 3) not null default 0 check (qty_prevista >= 0),
  qty_effettiva numeric(14, 3) check (qty_effettiva is null or qty_effettiva > 0),
  unita text not null default 'kg',
  codice_mp text not null default '',
  lotto_codice text not null default '',
  essiccatore_id text,
  esito text not null default 'previsto'
    check (esito in ('previsto', 'eseguito', 'annullato', 'errore')),
  note text not null default '',
  note_correttive text not null default '',
  versione integer not null default 1,
  documento_stato text not null default 'bozza'
    check (documento_stato in ('bozza', 'approvato', 'chiuso')),
  eseguito_at timestamptz,
  eseguito_by uuid references auth.users (id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  created_by uuid references auth.users (id) on delete set null,
  updated_by uuid references auth.users (id) on delete set null,
  deleted_at timestamptz,
  deleted_by uuid references auth.users (id) on delete set null,
  constraint produzione_foglio_effetti_ess_check check (
    essiccatore_id is null
    or essiccatore_id in ('ess-a', 'ess-b', 'ess-ultimo-stadio')
  )
);

create index if not exists produzione_foglio_effetti_esec_idx
  on public.produzione_foglio_processo_effetti (esecuzione_id)
  where deleted_at is null;

create index if not exists produzione_foglio_effetti_cestone_idx
  on public.produzione_foglio_processo_effetti (
    essiccatore_id, tipo, esito
  )
  where deleted_at is null;

comment on table public.produzione_foglio_processo_effetti is
  'Effetti eseguiti sul foglio. carica_cestone alimenta i kg Avvio essiccatore.';

drop trigger if exists produzione_foglio_processo_effetti_updated_at
  on public.produzione_foglio_processo_effetti;
create trigger produzione_foglio_processo_effetti_updated_at
  before update on public.produzione_foglio_processo_effetti
  for each row execute function public.set_updated_at();

alter table public.produzione_foglio_processo_effetti enable row level security;

drop policy if exists produzione_foglio_effetti_select
  on public.produzione_foglio_processo_effetti;
create policy produzione_foglio_effetti_select
  on public.produzione_foglio_processo_effetti for select to authenticated
  using (
    public.has_area_access('produzione')
    or public.has_area_access('action')
    or public.has_area_access('amministrazione')
    or public.is_superadmin()
  );

drop policy if exists produzione_foglio_effetti_write
  on public.produzione_foglio_processo_effetti;
create policy produzione_foglio_effetti_write
  on public.produzione_foglio_processo_effetti for insert to authenticated
  with check (
    public.has_area_access('produzione')
    or public.is_superadmin()
  );

drop policy if exists produzione_foglio_effetti_update
  on public.produzione_foglio_processo_effetti;
create policy produzione_foglio_effetti_update
  on public.produzione_foglio_processo_effetti for update to authenticated
  using (
    public.has_area_access('produzione')
    or public.is_superadmin()
  )
  with check (
    public.has_area_access('produzione')
    or public.is_superadmin()
  );

grant select, insert, update on table public.produzione_foglio_processo_effetti
  to authenticated;
grant all on table public.produzione_foglio_processo_effetti
  to postgres, service_role;
revoke delete on table public.produzione_foglio_processo_effetti
  from authenticated;
