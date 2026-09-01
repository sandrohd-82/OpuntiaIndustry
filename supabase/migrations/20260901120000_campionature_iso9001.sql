-- Campionature: documento distinto dagli ordini (ISO 9001)
-- Collegata a cliente + righe prodotto/lotto. Soft delete, versione, approvazione.

create table if not exists public.campionature (
  id uuid primary key default gen_random_uuid(),
  numero_interno text not null,
  cliente_id uuid references public.clienti (id) on delete set null,
  cliente_ragione_sociale text not null,
  cliente_codice_targa text not null,
  data_invio date not null,
  destinatario text not null default '',
  indirizzo_spedizione text not null default '',
  note text not null default '',
  stato text not null default 'bozza',
  documento_stato text not null default 'bozza',
  versione integer not null default 1,
  approved_at timestamptz,
  approved_by uuid references auth.users (id) on delete set null,
  sent_at timestamptz,
  sent_by uuid references auth.users (id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  created_by uuid references auth.users (id) on delete set null,
  updated_by uuid references auth.users (id) on delete set null,
  deleted_at timestamptz,
  deleted_by uuid references auth.users (id) on delete set null,
  constraint campionature_stato_check check (
    stato in ('bozza', 'inviata', 'consegnata', 'annullata')
  ),
  constraint campionature_documento_stato_check check (
    documento_stato in ('bozza', 'approvato', 'chiuso')
  ),
  constraint campionature_numero_len check (char_length(trim(numero_interno)) >= 3),
  constraint campionature_cliente_nome_len check (
    char_length(trim(cliente_ragione_sociale)) >= 1
  )
);

comment on table public.campionature is
  'Invii campionatura (documento distinto dagli ordini) — ISO 9001 §8.5.2';
comment on column public.campionature.numero_interno is
  'Formato Cp-AA-TARGA/N (es. Cp-26-C003/1)';
comment on column public.campionature.deleted_at is
  'Soft delete: mai cancellazione fisica';

create unique index if not exists campionature_numero_attivo_uidx
  on public.campionature (numero_interno)
  where deleted_at is null;

create index if not exists campionature_cliente_idx
  on public.campionature (cliente_id)
  where deleted_at is null;

create index if not exists campionature_data_idx
  on public.campionature (data_invio desc)
  where deleted_at is null;

drop trigger if exists campionature_updated_at on public.campionature;
create trigger campionature_updated_at
  before update on public.campionature
  for each row execute function public.set_updated_at();

create table if not exists public.campionature_righe (
  id uuid primary key default gen_random_uuid(),
  campionatura_id uuid not null references public.campionature (id) on delete cascade,
  prodotto_id uuid references public.prodotti_propri (id) on delete set null,
  prodotto_codice text not null default '',
  prodotto_nome text not null default '',
  quantita numeric(14, 4) not null default 0,
  unita_misura text not null default 'g',
  lotto_codice text not null default '',
  note text not null default '',
  sort_order integer not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  created_by uuid references auth.users (id) on delete set null,
  updated_by uuid references auth.users (id) on delete set null,
  constraint campionature_righe_qta_check check (quantita >= 0),
  constraint campionature_righe_um_check check (
    unita_misura in ('g', 'kg', 'pz', 'ml')
  )
);

comment on column public.campionature_righe.lotto_codice is
  'Codice lotto produzione/magazzino (testo; FK lotti quando la tabella lotti sarà attiva)';

create index if not exists campionature_righe_parent_idx
  on public.campionature_righe (campionatura_id, sort_order);

drop trigger if exists campionature_righe_updated_at on public.campionature_righe;
create trigger campionature_righe_updated_at
  before update on public.campionature_righe
  for each row execute function public.set_updated_at();

alter table public.campionature enable row level security;
alter table public.campionature_righe enable row level security;

drop policy if exists "campionature_staff_select" on public.campionature;
create policy "campionature_staff_select"
  on public.campionature for select to authenticated
  using (
    public.has_area_access('amministrazione')
    or public.has_area_access('produzione')
    or public.has_area_access('magazzino')
    or public.is_superadmin()
  );

drop policy if exists "campionature_staff_insert" on public.campionature;
create policy "campionature_staff_insert"
  on public.campionature for insert to authenticated
  with check (
    public.has_area_access('amministrazione')
    or public.has_area_access('produzione')
    or public.is_superadmin()
  );

drop policy if exists "campionature_staff_update" on public.campionature;
create policy "campionature_staff_update"
  on public.campionature for update to authenticated
  using (
    public.has_area_access('amministrazione')
    or public.has_area_access('produzione')
    or public.is_superadmin()
  )
  with check (
    public.has_area_access('amministrazione')
    or public.has_area_access('produzione')
    or public.is_superadmin()
  );

drop policy if exists "campionature_righe_staff_select" on public.campionature_righe;
create policy "campionature_righe_staff_select"
  on public.campionature_righe for select to authenticated
  using (
    public.has_area_access('amministrazione')
    or public.has_area_access('produzione')
    or public.has_area_access('magazzino')
    or public.is_superadmin()
  );

drop policy if exists "campionature_righe_staff_write" on public.campionature_righe;
create policy "campionature_righe_staff_write"
  on public.campionature_righe for all to authenticated
  using (
    public.has_area_access('amministrazione')
    or public.has_area_access('produzione')
    or public.is_superadmin()
  )
  with check (
    public.has_area_access('amministrazione')
    or public.has_area_access('produzione')
    or public.is_superadmin()
  );

grant select, insert, update on table public.campionature to authenticated;
grant select, insert, update, delete on table public.campionature_righe to authenticated;
grant all on table public.campionature to postgres, service_role;
grant all on table public.campionature_righe to postgres, service_role;

revoke delete on table public.campionature from authenticated;
