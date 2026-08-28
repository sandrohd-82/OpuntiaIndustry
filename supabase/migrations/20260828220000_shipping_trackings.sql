-- Tracking spedizioni collegato alle note Timeline — ISO 9001

create table if not exists public.shipping_trackings (
  id uuid primary key default gen_random_uuid(),
  nota_id uuid references public.pn_note (id) on delete set null,
  entity_type text
    check (
      entity_type is null
      or entity_type in (
        'cliente',
        'fornitore',
        'cliente_possibile',
        'ordine',
        'altro'
      )
    ),
  entity_id uuid,
  tracking_url text not null,
  carrier text not null default '',
  tracking_code text not null default '',
  current_status text not null default 'sconosciuto'
    check (
      current_status in (
        'registrato',
        'in_transito',
        'in_consegna',
        'consegnato',
        'anomalia',
        'sconosciuto'
      )
    ),
  last_checked_at timestamptz,
  last_check_note text not null default '',
  versione integer not null default 1 check (versione >= 1),
  documento_stato text not null default 'attivo'
    check (documento_stato in ('attivo', 'chiuso', 'archiviato')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  created_by uuid references auth.users (id) on delete set null,
  updated_by uuid references auth.users (id) on delete set null,
  deleted_at timestamptz,
  deleted_by uuid references auth.users (id) on delete set null
);

create index if not exists shipping_trackings_nota_idx
  on public.shipping_trackings (nota_id)
  where deleted_at is null;

create index if not exists shipping_trackings_entity_idx
  on public.shipping_trackings (entity_type, entity_id)
  where deleted_at is null and entity_type is not null;

drop trigger if exists shipping_trackings_updated_at on public.shipping_trackings;
create trigger shipping_trackings_updated_at
  before update on public.shipping_trackings
  for each row execute function public.set_updated_at();

-- Storico controlli (immutabile per authenticated)
create table if not exists public.shipping_tracking_logs (
  id uuid primary key default gen_random_uuid(),
  tracking_id uuid not null references public.shipping_trackings (id) on delete cascade,
  status text not null default 'sconosciuto'
    check (
      status in (
        'registrato',
        'in_transito',
        'in_consegna',
        'consegnato',
        'anomalia',
        'sconosciuto'
      )
    ),
  details jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  created_by uuid references auth.users (id) on delete set null
);

create index if not exists shipping_tracking_logs_tracking_idx
  on public.shipping_tracking_logs (tracking_id, created_at desc);

alter table public.shipping_trackings enable row level security;
alter table public.shipping_tracking_logs enable row level security;

drop policy if exists "shipping_trackings_select" on public.shipping_trackings;
create policy "shipping_trackings_select" on public.shipping_trackings
  for select to authenticated
  using (
    deleted_at is null
    and (
      public.has_area_access('promemorie-e-note')
      or public.has_area_access('amministrazione')
      or public.is_superadmin()
    )
  );

drop policy if exists "shipping_trackings_insert" on public.shipping_trackings;
create policy "shipping_trackings_insert" on public.shipping_trackings
  for insert to authenticated
  with check (
    public.has_area_access('promemorie-e-note')
    or public.has_area_access('amministrazione')
    or public.is_superadmin()
  );

drop policy if exists "shipping_trackings_update" on public.shipping_trackings;
create policy "shipping_trackings_update" on public.shipping_trackings
  for update to authenticated
  using (
    public.has_area_access('promemorie-e-note')
    or public.has_area_access('amministrazione')
    or public.is_superadmin()
  )
  with check (
    public.has_area_access('promemorie-e-note')
    or public.has_area_access('amministrazione')
    or public.is_superadmin()
  );

drop policy if exists "shipping_tracking_logs_select" on public.shipping_tracking_logs;
create policy "shipping_tracking_logs_select" on public.shipping_tracking_logs
  for select to authenticated
  using (
    public.has_area_access('promemorie-e-note')
    or public.has_area_access('amministrazione')
    or public.is_superadmin()
  );

drop policy if exists "shipping_tracking_logs_insert" on public.shipping_tracking_logs;
create policy "shipping_tracking_logs_insert" on public.shipping_tracking_logs
  for insert to authenticated
  with check (
    public.has_area_access('promemorie-e-note')
    or public.has_area_access('amministrazione')
    or public.is_superadmin()
  );

grant select, insert, update on public.shipping_trackings to authenticated;
grant select, insert on public.shipping_tracking_logs to authenticated;
grant all on public.shipping_trackings to postgres, service_role;
grant all on public.shipping_tracking_logs to postgres, service_role;
revoke delete on public.shipping_trackings from authenticated;
revoke update, delete on public.shipping_tracking_logs from authenticated;

comment on table public.shipping_trackings is
  'Tracking spedizioni collegati a note Timeline — ISO 7.5 / 8.5.2';
comment on table public.shipping_tracking_logs is
  'Storico immutabile controlli tracking — ISO 8.5.2';
