-- Collegamento fra progetto/viaggio e fatture già presenti in area fiscale.
-- Non copia il documento e non ne cambia lo stato SDI.

create table if not exists public.spese_progetti_fatture (
  id uuid primary key default gen_random_uuid(),
  progetto_id uuid not null references public.spese_progetti (id),
  origine text not null check (origine in ('emessa', 'ricevuta')),
  fattura_emessa_id uuid references public.fatture_emesse (id),
  fattura_ricevuta_id uuid references public.fatture_ricevute (id),
  numero text not null default '',
  controparte text not null default '',
  data_documento date,
  totale numeric(14, 2),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  created_by uuid references auth.users (id) on delete set null,
  updated_by uuid references auth.users (id) on delete set null,
  deleted_at timestamptz,
  deleted_by uuid references auth.users (id) on delete set null,
  constraint spese_progetti_fatture_una_origine check (
    (
      origine = 'emessa'
      and fattura_emessa_id is not null
      and fattura_ricevuta_id is null
    )
    or (
      origine = 'ricevuta'
      and fattura_ricevuta_id is not null
      and fattura_emessa_id is null
    )
  )
);

create unique index if not exists spese_progetti_fatture_emessa_attiva_uidx
  on public.spese_progetti_fatture (fattura_emessa_id)
  where deleted_at is null and fattura_emessa_id is not null;

create unique index if not exists spese_progetti_fatture_ricevuta_attiva_uidx
  on public.spese_progetti_fatture (fattura_ricevuta_id)
  where deleted_at is null and fattura_ricevuta_id is not null;

create index if not exists spese_progetti_fatture_progetto_idx
  on public.spese_progetti_fatture (progetto_id)
  where deleted_at is null;

comment on table public.spese_progetti_fatture is
  'Fatture emesse o ricevute citate da un progetto. Il pacchetto non le contabilizza: restano nello stato SDI.';

drop trigger if exists spese_progetti_fatture_updated_at on public.spese_progetti_fatture;
create trigger spese_progetti_fatture_updated_at
  before update on public.spese_progetti_fatture
  for each row execute function public.set_updated_at();

alter table public.spese_progetti_fatture enable row level security;

drop policy if exists spese_progetti_fatture_select on public.spese_progetti_fatture;
create policy spese_progetti_fatture_select
  on public.spese_progetti_fatture for select to authenticated
  using (public.has_area_access('area-fiscale') or public.is_superadmin());

drop policy if exists spese_progetti_fatture_insert on public.spese_progetti_fatture;
create policy spese_progetti_fatture_insert
  on public.spese_progetti_fatture for insert to authenticated
  with check (public.has_area_access('area-fiscale') or public.is_superadmin());

drop policy if exists spese_progetti_fatture_update on public.spese_progetti_fatture;
create policy spese_progetti_fatture_update
  on public.spese_progetti_fatture for update to authenticated
  using (public.has_area_access('area-fiscale') or public.is_superadmin())
  with check (public.has_area_access('area-fiscale') or public.is_superadmin());

grant select, insert, update on table public.spese_progetti_fatture to authenticated;
grant all on table public.spese_progetti_fatture to postgres, service_role;
revoke delete on table public.spese_progetti_fatture from authenticated, anon;

notify pgrst, 'reload schema';
