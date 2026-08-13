-- Calendario produzione: giorni impegnati per ordine (ISO 9001)
-- Usato dal wizard consegna per posizionare N giorni lavorativi.

create table if not exists public.produzione_calendario_impegni (
  id uuid primary key default gen_random_uuid(),
  data_giorno date not null,
  ordine_id uuid references public.ordini (id) on delete set null,
  linea_codice text,
  etichetta text not null default '',
  note text not null default '',
  created_by uuid references auth.users (id) on delete set null,
  updated_by uuid references auth.users (id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz,
  deleted_by uuid references auth.users (id) on delete set null,
  constraint produzione_cal_impegni_linea_check check (
    linea_codice is null or linea_codice in ('secco', 'gel')
  )
);

create unique index if not exists produzione_cal_impegni_giorno_ordine_uidx
  on public.produzione_calendario_impegni (data_giorno, ordine_id)
  where deleted_at is null and ordine_id is not null;

create index if not exists produzione_cal_impegni_giorno_idx
  on public.produzione_calendario_impegni (data_giorno)
  where deleted_at is null;

comment on table public.produzione_calendario_impegni is
  'Giorni di produzione impegnati (calendario consegna ordini)';

drop trigger if exists produzione_cal_impegni_updated_at
  on public.produzione_calendario_impegni;
create trigger produzione_cal_impegni_updated_at
  before update on public.produzione_calendario_impegni
  for each row execute function public.set_updated_at();

alter table public.produzione_calendario_impegni enable row level security;
drop policy if exists "produzione_cal_impegni_all"
  on public.produzione_calendario_impegni;
create policy "produzione_cal_impegni_all"
  on public.produzione_calendario_impegni for all to authenticated
  using (public.has_area_access('amministrazione') or public.is_superadmin())
  with check (public.has_area_access('amministrazione') or public.is_superadmin());

grant select, insert, update on table public.produzione_calendario_impegni
  to authenticated;
grant all on table public.produzione_calendario_impegni
  to postgres, service_role;
revoke delete on table public.produzione_calendario_impegni from authenticated;

-- Snapshot selezione giorni sull’ordine
alter table public.ordini
  add column if not exists giorni_produzione date[] not null default '{}';

comment on column public.ordini.giorni_produzione is
  'Giorni lavorativi selezionati sul calendario consegna (ordine corrente)';
