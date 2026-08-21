-- Magazzino Opzione A: reparti produzione, parametri giacenza (soglia + reparto), note di acquisto ISO 9001

-- ---------------------------------------------------------------------------
-- Reparti (anagrafica Produzione)
-- ---------------------------------------------------------------------------
create table if not exists public.produzione_reparti (
  id uuid primary key default gen_random_uuid(),
  codice text not null,
  nome text not null,
  attivo boolean not null default true,
  note text not null default '',
  created_by uuid references auth.users (id) on delete set null,
  updated_by uuid references auth.users (id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz,
  deleted_by uuid references auth.users (id) on delete set null
);

create unique index if not exists produzione_reparti_codice_lower_uidx
  on public.produzione_reparti (lower(codice))
  where deleted_at is null;

comment on table public.produzione_reparti is
  'Reparti produttivi (ISO 9001) — collegabili ai prodotti in magazzino.';

drop trigger if exists produzione_reparti_updated_at on public.produzione_reparti;
create trigger produzione_reparti_updated_at
  before update on public.produzione_reparti
  for each row execute function public.set_updated_at();

alter table public.produzione_reparti enable row level security;
drop policy if exists "produzione_reparti_all" on public.produzione_reparti;
create policy "produzione_reparti_all"
  on public.produzione_reparti for all to authenticated
  using (
    public.has_area_access('produzione')
    or public.has_area_access('magazzino')
    or public.has_area_access('amministrazione')
    or public.is_superadmin()
  )
  with check (
    public.has_area_access('produzione')
    or public.has_area_access('amministrazione')
    or public.is_superadmin()
  );
grant select, insert, update, delete on table public.produzione_reparti to authenticated;
grant all on table public.produzione_reparti to postgres, service_role;

-- ---------------------------------------------------------------------------
-- Estensione giacenze: soglia riserva + reparto + unità
-- ---------------------------------------------------------------------------
alter table public.magazzino_giacenze
  add column if not exists quantita_riserva numeric(14, 3),
  add column if not exists reparto_id uuid references public.produzione_reparti (id) on delete set null,
  add column if not exists unita text not null default 'kg';

alter table public.magazzino_giacenze
  drop constraint if exists magazzino_giacenze_unita_check;
alter table public.magazzino_giacenze
  add constraint magazzino_giacenze_unita_check
    check (unita in ('kg', 'pz'));

alter table public.magazzino_giacenze
  drop constraint if exists magazzino_giacenze_riserva_check;
alter table public.magazzino_giacenze
  add constraint magazzino_giacenze_riserva_check
    check (quantita_riserva is null or quantita_riserva >= 0);

create index if not exists magazzino_giacenze_reparto_idx
  on public.magazzino_giacenze (reparto_id)
  where deleted_at is null;

drop policy if exists "magazzino_giacenze_all" on public.magazzino_giacenze;
create policy "magazzino_giacenze_all"
  on public.magazzino_giacenze for all to authenticated
  using (
    public.has_area_access('magazzino')
    or public.has_area_access('amministrazione')
    or public.is_superadmin()
  )
  with check (
    public.has_area_access('magazzino')
    or public.has_area_access('amministrazione')
    or public.is_superadmin()
  );

drop policy if exists "magazzino_movimenti_all" on public.magazzino_movimenti;
create policy "magazzino_movimenti_all"
  on public.magazzino_movimenti for all to authenticated
  using (
    public.has_area_access('magazzino')
    or public.has_area_access('amministrazione')
    or public.is_superadmin()
  )
  with check (
    public.has_area_access('magazzino')
    or public.has_area_access('amministrazione')
    or public.is_superadmin()
  );

-- ---------------------------------------------------------------------------
-- Note di acquisto (documento ISO: versione + stato)
-- ---------------------------------------------------------------------------
create table if not exists public.magazzino_note_acquisto (
  id uuid primary key default gen_random_uuid(),
  numero text not null,
  versione integer not null default 1,
  documento_stato text not null default 'aperta'
    check (documento_stato in ('bozza', 'aperta', 'chiusa', 'annullata')),
  titolo text not null default 'Nota di acquisto',
  note text not null default '',
  created_by uuid references auth.users (id) on delete set null,
  updated_by uuid references auth.users (id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz,
  deleted_by uuid references auth.users (id) on delete set null,
  closed_at timestamptz,
  closed_by uuid references auth.users (id) on delete set null
);

create unique index if not exists magazzino_note_acquisto_numero_uidx
  on public.magazzino_note_acquisto (lower(numero))
  where deleted_at is null;

comment on table public.magazzino_note_acquisto is
  'Note di acquisto magazzino (ISO 9001) generate dalle soglie di riserva.';

drop trigger if exists magazzino_note_acquisto_updated_at on public.magazzino_note_acquisto;
create trigger magazzino_note_acquisto_updated_at
  before update on public.magazzino_note_acquisto
  for each row execute function public.set_updated_at();

create table if not exists public.magazzino_note_acquisto_righe (
  id uuid primary key default gen_random_uuid(),
  nota_id uuid not null references public.magazzino_note_acquisto (id) on delete cascade,
  prodotto_id uuid not null references public.prodotti_propri (id) on delete restrict,
  prodotto_codice text not null default '',
  prodotto_nome text not null default '',
  quantita_richiesta numeric(14, 3) not null default 1,
  unita text not null default 'kg' check (unita in ('kg', 'pz')),
  motivo text not null default 'soglia_riserva',
  sort_order integer not null default 0,
  created_by uuid references auth.users (id) on delete set null,
  updated_by uuid references auth.users (id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz,
  deleted_by uuid references auth.users (id) on delete set null,
  constraint magazzino_note_acquisto_righe_qty_check check (quantita_richiesta > 0)
);

create unique index if not exists magazzino_note_acquisto_righe_open_prodotto_uidx
  on public.magazzino_note_acquisto_righe (nota_id, prodotto_id)
  where deleted_at is null;

create index if not exists magazzino_note_acquisto_righe_prodotto_idx
  on public.magazzino_note_acquisto_righe (prodotto_id)
  where deleted_at is null;

drop trigger if exists magazzino_note_acquisto_righe_updated_at
  on public.magazzino_note_acquisto_righe;
create trigger magazzino_note_acquisto_righe_updated_at
  before update on public.magazzino_note_acquisto_righe
  for each row execute function public.set_updated_at();

alter table public.magazzino_note_acquisto enable row level security;
alter table public.magazzino_note_acquisto_righe enable row level security;

drop policy if exists "magazzino_note_acquisto_all" on public.magazzino_note_acquisto;
create policy "magazzino_note_acquisto_all"
  on public.magazzino_note_acquisto for all to authenticated
  using (
    public.has_area_access('magazzino')
    or public.has_area_access('amministrazione')
    or public.is_superadmin()
  )
  with check (
    public.has_area_access('magazzino')
    or public.has_area_access('amministrazione')
    or public.is_superadmin()
  );

drop policy if exists "magazzino_note_acquisto_righe_all"
  on public.magazzino_note_acquisto_righe;
create policy "magazzino_note_acquisto_righe_all"
  on public.magazzino_note_acquisto_righe for all to authenticated
  using (
    public.has_area_access('magazzino')
    or public.has_area_access('amministrazione')
    or public.is_superadmin()
  )
  with check (
    public.has_area_access('magazzino')
    or public.has_area_access('amministrazione')
    or public.is_superadmin()
  );

grant select, insert, update, delete on table public.magazzino_note_acquisto to authenticated;
grant select, insert, update, delete on table public.magazzino_note_acquisto_righe to authenticated;
grant all on table public.magazzino_note_acquisto to postgres, service_role;
grant all on table public.magazzino_note_acquisto_righe to postgres, service_role;
