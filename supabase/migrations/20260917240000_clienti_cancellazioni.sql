-- Prenotazione cancellazione cliente: conferma solo Super Admin.
-- ISO 9001: audit + soft delete della pratica; nessun delete fisico. Nessun NOTIFY.

create table if not exists public.clienti_cancellazioni (
  id uuid primary key default gen_random_uuid(),
  cliente_id uuid not null,
  codice_targa text not null default '',
  ragione_sociale text not null default '',
  stato text not null
    check (stato in ('prenotata', 'approvata', 'rifiutata')),
  motivo text not null default '',
  conferma_prenotazione text not null default '',
  requested_by uuid references auth.users (id) on delete set null,
  requested_at timestamptz not null default now(),
  resolved_by uuid references auth.users (id) on delete set null,
  resolved_at timestamptz,
  nota_esito text not null default '',
  created_by uuid references auth.users (id) on delete set null,
  updated_by uuid references auth.users (id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz,
  deleted_by uuid references auth.users (id) on delete set null
);

comment on table public.clienti_cancellazioni is
  'Prenotazione di cancellazione scheda cliente. Solo Super Admin approva o rifiuta.';

create unique index if not exists clienti_cancellazioni_prenotata_uidx
  on public.clienti_cancellazioni (cliente_id)
  where deleted_at is null and stato = 'prenotata';

create index if not exists clienti_cancellazioni_stato_idx
  on public.clienti_cancellazioni (stato)
  where deleted_at is null;

drop trigger if exists clienti_cancellazioni_updated_at
  on public.clienti_cancellazioni;
create trigger clienti_cancellazioni_updated_at
  before update on public.clienti_cancellazioni
  for each row execute function public.set_updated_at();

alter table public.clienti_cancellazioni enable row level security;

drop policy if exists clienti_cancellazioni_all
  on public.clienti_cancellazioni;
create policy clienti_cancellazioni_all
  on public.clienti_cancellazioni for all to authenticated
  using (
    public.has_area_access('amministrazione')
    or public.has_area_access('commerciale')
    or public.is_superadmin()
  )
  with check (
    public.has_area_access('amministrazione')
    or public.has_area_access('commerciale')
    or public.is_superadmin()
  );

grant select, insert, update on table public.clienti_cancellazioni
  to authenticated;
grant all on table public.clienti_cancellazioni
  to postgres, service_role;
revoke delete on table public.clienti_cancellazioni from authenticated;
