-- Dilazioni pagamento fatture emesse/ricevute — ISO 9001 (audit + soft delete + RLS)

-- ---------------------------------------------------------------------------
-- fatture_emesse_dilazioni
-- ---------------------------------------------------------------------------
create table if not exists public.fatture_emesse_dilazioni (
  id uuid primary key default gen_random_uuid(),
  fattura_id uuid not null references public.fatture_emesse (id) on delete cascade,
  data_scadenza date not null,
  importo numeric(14, 2) not null default 0,
  stato_pagamento text not null default 'da_pagare',
  sort_order integer not null default 0,
  note text not null default '',
  created_by uuid references auth.users (id) on delete set null,
  updated_by uuid references auth.users (id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz,
  deleted_by uuid references auth.users (id) on delete set null,
  constraint fatture_emesse_dilazioni_stato_check check (
    stato_pagamento in ('pagato', 'da_pagare')
  ),
  constraint fatture_emesse_dilazioni_importo_check check (importo >= 0)
);

comment on table public.fatture_emesse_dilazioni is
  'Scadenze/dilazioni di pagamento fattura emessa — una riga per data e stato';

create index if not exists fatture_emesse_dilazioni_fattura_idx
  on public.fatture_emesse_dilazioni (fattura_id, sort_order)
  where deleted_at is null;

create index if not exists fatture_emesse_dilazioni_scadenza_idx
  on public.fatture_emesse_dilazioni (data_scadenza)
  where deleted_at is null;

drop trigger if exists fatture_emesse_dilazioni_updated_at on public.fatture_emesse_dilazioni;
create trigger fatture_emesse_dilazioni_updated_at
  before update on public.fatture_emesse_dilazioni
  for each row execute function public.set_updated_at();

alter table public.fatture_emesse_dilazioni enable row level security;

drop policy if exists "fatture_emesse_dilazioni_select" on public.fatture_emesse_dilazioni;
create policy "fatture_emesse_dilazioni_select"
  on public.fatture_emesse_dilazioni for select to authenticated
  using (public.has_area_access('amministrazione') or public.is_superadmin());

drop policy if exists "fatture_emesse_dilazioni_insert" on public.fatture_emesse_dilazioni;
create policy "fatture_emesse_dilazioni_insert"
  on public.fatture_emesse_dilazioni for insert to authenticated
  with check (public.has_area_access('amministrazione') or public.is_superadmin());

drop policy if exists "fatture_emesse_dilazioni_update" on public.fatture_emesse_dilazioni;
create policy "fatture_emesse_dilazioni_update"
  on public.fatture_emesse_dilazioni for update to authenticated
  using (public.has_area_access('amministrazione') or public.is_superadmin())
  with check (public.has_area_access('amministrazione') or public.is_superadmin());

drop policy if exists "fatture_emesse_dilazioni_delete" on public.fatture_emesse_dilazioni;
create policy "fatture_emesse_dilazioni_delete"
  on public.fatture_emesse_dilazioni for delete to authenticated
  using (public.has_area_access('amministrazione') or public.is_superadmin());

grant select, insert, update, delete on table public.fatture_emesse_dilazioni to authenticated;
grant all on table public.fatture_emesse_dilazioni to postgres, service_role;

-- ---------------------------------------------------------------------------
-- fatture_ricevute_dilazioni
-- ---------------------------------------------------------------------------
create table if not exists public.fatture_ricevute_dilazioni (
  id uuid primary key default gen_random_uuid(),
  fattura_id uuid not null references public.fatture_ricevute (id) on delete cascade,
  data_scadenza date not null,
  importo numeric(14, 2) not null default 0,
  stato_pagamento text not null default 'da_pagare',
  sort_order integer not null default 0,
  note text not null default '',
  created_by uuid references auth.users (id) on delete set null,
  updated_by uuid references auth.users (id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz,
  deleted_by uuid references auth.users (id) on delete set null,
  constraint fatture_ricevute_dilazioni_stato_check check (
    stato_pagamento in ('pagato', 'da_pagare')
  ),
  constraint fatture_ricevute_dilazioni_importo_check check (importo >= 0)
);

comment on table public.fatture_ricevute_dilazioni is
  'Scadenze/dilazioni di pagamento fattura ricevuta — una riga per data e stato';

create index if not exists fatture_ricevute_dilazioni_fattura_idx
  on public.fatture_ricevute_dilazioni (fattura_id, sort_order)
  where deleted_at is null;

create index if not exists fatture_ricevute_dilazioni_scadenza_idx
  on public.fatture_ricevute_dilazioni (data_scadenza)
  where deleted_at is null;

drop trigger if exists fatture_ricevute_dilazioni_updated_at on public.fatture_ricevute_dilazioni;
create trigger fatture_ricevute_dilazioni_updated_at
  before update on public.fatture_ricevute_dilazioni
  for each row execute function public.set_updated_at();

alter table public.fatture_ricevute_dilazioni enable row level security;

drop policy if exists "fatture_ricevute_dilazioni_select" on public.fatture_ricevute_dilazioni;
create policy "fatture_ricevute_dilazioni_select"
  on public.fatture_ricevute_dilazioni for select to authenticated
  using (public.has_area_access('amministrazione') or public.is_superadmin());

drop policy if exists "fatture_ricevute_dilazioni_insert" on public.fatture_ricevute_dilazioni;
create policy "fatture_ricevute_dilazioni_insert"
  on public.fatture_ricevute_dilazioni for insert to authenticated
  with check (public.has_area_access('amministrazione') or public.is_superadmin());

drop policy if exists "fatture_ricevute_dilazioni_update" on public.fatture_ricevute_dilazioni;
create policy "fatture_ricevute_dilazioni_update"
  on public.fatture_ricevute_dilazioni for update to authenticated
  using (public.has_area_access('amministrazione') or public.is_superadmin())
  with check (public.has_area_access('amministrazione') or public.is_superadmin());

drop policy if exists "fatture_ricevute_dilazioni_delete" on public.fatture_ricevute_dilazioni;
create policy "fatture_ricevute_dilazioni_delete"
  on public.fatture_ricevute_dilazioni for delete to authenticated
  using (public.has_area_access('amministrazione') or public.is_superadmin());

grant select, insert, update, delete on table public.fatture_ricevute_dilazioni to authenticated;
grant all on table public.fatture_ricevute_dilazioni to postgres, service_role;
