-- Preventivi: documento ISO distinto, collegabile all’ordine solo se accettato

create table if not exists public.preventivi (
  id uuid primary key default gen_random_uuid(),
  numero_interno text not null,
  cliente_id uuid references public.clienti (id) on delete set null,
  cliente_ragione_sociale text not null,
  cliente_codice_targa text not null,
  data_preventivo date not null,
  stato text not null default 'creato',
  documento_stato text not null default 'bozza',
  versione integer not null default 1,
  consegna_metodo text not null default 'corriere_nostro',
  spedizione_a_carico text not null default 'cliente',
  spedizione_importo numeric(12, 2) not null default 0,
  tipo_pagamento text not null default 'alla_consegna',
  tempi_pagamento_giorni integer,
  tempi_pagamento_note text not null default '',
  note text not null default '',
  webmail_accettazione_id uuid,
  referente_accettazione_id uuid references public.rubrica_contatti (id) on delete set null,
  sent_at timestamptz,
  sent_by uuid references auth.users (id) on delete set null,
  accepted_at timestamptz,
  accepted_by uuid references auth.users (id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  created_by uuid references auth.users (id) on delete set null,
  updated_by uuid references auth.users (id) on delete set null,
  deleted_at timestamptz,
  deleted_by uuid references auth.users (id) on delete set null,
  constraint preventivi_stato_check check (
    stato in ('creato', 'inviato', 'accettato', 'respinto')
  ),
  constraint preventivi_documento_stato_check check (
    documento_stato in ('bozza', 'approvato', 'chiuso')
  ),
  constraint preventivi_consegna_check check (
    consegna_metodo in ('ritiro', 'corriere_nostro', 'corriere_cliente')
  ),
  constraint preventivi_spedizione_carico_check check (
    spedizione_a_carico in ('cliente', 'agrinsicilia', 'diviso')
  ),
  constraint preventivi_pagamento_check check (
    tipo_pagamento in ('anticipato', 'alla_consegna', 'posticipato', 'dilazionato')
  ),
  constraint preventivi_numero_len check (char_length(trim(numero_interno)) >= 3)
);

comment on table public.preventivi is
  'Preventivi commerciali (ISO 9001). Collegabili a ordini solo se stato=accettato';
comment on column public.preventivi.stato is
  'creato=non inviato, inviato, accettato, respinto';

create unique index if not exists preventivi_numero_attivo_uidx
  on public.preventivi (numero_interno)
  where deleted_at is null;

create index if not exists preventivi_cliente_idx
  on public.preventivi (cliente_id)
  where deleted_at is null;

drop trigger if exists preventivi_updated_at on public.preventivi;
create trigger preventivi_updated_at
  before update on public.preventivi
  for each row execute function public.set_updated_at();

create table if not exists public.preventivi_righe (
  id uuid primary key default gen_random_uuid(),
  preventivo_id uuid not null references public.preventivi (id) on delete cascade,
  prodotto_id uuid references public.prodotti_propri (id) on delete set null,
  prodotto_codice text not null default '',
  prodotto_nome text not null default '',
  quantita numeric(14, 4) not null default 0,
  unita_misura text not null default 'kg',
  prezzo_unitario numeric(14, 4) not null default 0,
  iva_percentuale numeric(6, 2) not null default 22,
  listino_id uuid,
  prezzo_da_listino boolean not null default false,
  confezionamento text not null default '',
  imballaggio_voce_id uuid,
  sort_order integer not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  created_by uuid references auth.users (id) on delete set null,
  updated_by uuid references auth.users (id) on delete set null,
  constraint preventivi_righe_qta_check check (quantita >= 0)
);

drop trigger if exists preventivi_righe_updated_at on public.preventivi_righe;
create trigger preventivi_righe_updated_at
  before update on public.preventivi_righe
  for each row execute function public.set_updated_at();

create index if not exists preventivi_righe_parent_idx
  on public.preventivi_righe (preventivo_id, sort_order);

alter table public.ordini
  add column if not exists preventivo_id uuid
    references public.preventivi (id) on delete set null,
  add column if not exists webmail_accettazione_id uuid,
  add column if not exists referente_accettazione_id uuid
    references public.rubrica_contatti (id) on delete set null;

comment on column public.ordini.preventivo_id is
  'Preventivo accettato collegato in creazione ordine';

alter table public.preventivi enable row level security;
alter table public.preventivi_righe enable row level security;

drop policy if exists "preventivi_staff_select" on public.preventivi;
create policy "preventivi_staff_select"
  on public.preventivi for select to authenticated
  using (
    public.has_area_access('amministrazione')
    or public.has_area_access('commerciale')
    or public.is_superadmin()
  );

drop policy if exists "preventivi_staff_write" on public.preventivi;
create policy "preventivi_staff_write"
  on public.preventivi for all to authenticated
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

drop policy if exists "preventivi_righe_staff_select" on public.preventivi_righe;
create policy "preventivi_righe_staff_select"
  on public.preventivi_righe for select to authenticated
  using (
    public.has_area_access('amministrazione')
    or public.has_area_access('commerciale')
    or public.is_superadmin()
  );

drop policy if exists "preventivi_righe_staff_write" on public.preventivi_righe;
create policy "preventivi_righe_staff_write"
  on public.preventivi_righe for all to authenticated
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

grant select, insert, update on table public.preventivi to authenticated;
grant select, insert, update, delete on table public.preventivi_righe to authenticated;
grant all on table public.preventivi to postgres, service_role;
grant all on table public.preventivi_righe to postgres, service_role;
revoke delete on table public.preventivi from authenticated;
