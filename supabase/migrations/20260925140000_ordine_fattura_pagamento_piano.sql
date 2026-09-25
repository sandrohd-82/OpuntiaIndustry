-- Piano pagamento ordine (unica / dilazione) + tracciabilità invio fattura A4 → FiC/SDI
-- ISO 9001: audit, soft delete, mai delete fisico sulle rate

-- ---------------------------------------------------------------------------
-- ordini: modalità + pronto magazzino
-- ---------------------------------------------------------------------------
alter table public.ordini
  add column if not exists pagamento_modalita text not null default 'unica';

alter table public.ordini drop constraint if exists ordini_pagamento_modalita_check;
alter table public.ordini
  add constraint ordini_pagamento_modalita_check
  check (pagamento_modalita in ('unica', 'dilazione'));

alter table public.ordini drop constraint if exists ordini_tipo_pagamento_check;
alter table public.ordini
  add constraint ordini_tipo_pagamento_check
  check (
    tipo_pagamento in (
      'anticipato',
      'alla_consegna',
      'pronto_magazzino',
      'posticipato',
      'dilazionato'
    )
  );

comment on column public.ordini.pagamento_modalita is
  'unica = una scadenza; dilazione = più rate (tipo_pagamento = dilazionato)';
comment on column public.ordini.tipo_pagamento is
  'Unica: anticipato | alla_consegna | pronto_magazzino | posticipato. Dilazione: dilazionato';

-- ---------------------------------------------------------------------------
-- ordini_pagamento_rate
-- ---------------------------------------------------------------------------
create table if not exists public.ordini_pagamento_rate (
  id uuid primary key default gen_random_uuid(),
  ordine_id uuid not null references public.ordini (id) on delete restrict,
  sort_order integer not null default 0,
  importo numeric(14, 2) not null default 0,
  tipo_scadenza text,
  data_pagamento date,
  note text not null default '',
  created_by uuid references auth.users (id) on delete set null,
  updated_by uuid references auth.users (id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz,
  deleted_by uuid references auth.users (id) on delete set null,
  constraint ordini_pagamento_rate_importo_check check (importo >= 0),
  constraint ordini_pagamento_rate_tipo_check check (
    tipo_scadenza is null
    or tipo_scadenza in (
      'anticipato',
      'alla_consegna',
      'pronto_magazzino',
      'posticipato'
    )
  )
);

comment on table public.ordini_pagamento_rate is
  'Rate pagamento ordine — prima rata con tipo scadenza, successive con data';

create index if not exists ordini_pagamento_rate_ordine_idx
  on public.ordini_pagamento_rate (ordine_id, sort_order)
  where deleted_at is null;

drop trigger if exists ordini_pagamento_rate_updated_at on public.ordini_pagamento_rate;
create trigger ordini_pagamento_rate_updated_at
  before update on public.ordini_pagamento_rate
  for each row execute function public.set_updated_at();

alter table public.ordini_pagamento_rate enable row level security;

drop policy if exists "ordini_pagamento_rate_select" on public.ordini_pagamento_rate;
create policy "ordini_pagamento_rate_select"
  on public.ordini_pagamento_rate for select to authenticated
  using (
    public.has_area_access('amministrazione')
    or public.has_area_access('commerciale')
    or public.is_superadmin()
  );

drop policy if exists "ordini_pagamento_rate_insert" on public.ordini_pagamento_rate;
create policy "ordini_pagamento_rate_insert"
  on public.ordini_pagamento_rate for insert to authenticated
  with check (
    public.has_area_access('amministrazione')
    or public.has_area_access('commerciale')
    or public.is_superadmin()
  );

drop policy if exists "ordini_pagamento_rate_update" on public.ordini_pagamento_rate;
create policy "ordini_pagamento_rate_update"
  on public.ordini_pagamento_rate for update to authenticated
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

grant select, insert, update on table public.ordini_pagamento_rate to authenticated;
grant all on table public.ordini_pagamento_rate to postgres, service_role;

-- ---------------------------------------------------------------------------
-- fatture_emesse: invio email + piano
-- ---------------------------------------------------------------------------
alter table public.fatture_emesse
  add column if not exists invio_email text not null default '',
  add column if not exists sent_at timestamptz,
  add column if not exists sent_by uuid references auth.users (id) on delete set null,
  add column if not exists pagamento_modalita text not null default 'unica',
  add column if not exists tipo_scadenza_unica text;

alter table public.fatture_emesse drop constraint if exists fatture_emesse_pagamento_modalita_check;
alter table public.fatture_emesse
  add constraint fatture_emesse_pagamento_modalita_check
  check (pagamento_modalita in ('unica', 'dilazione'));

alter table public.fatture_emesse drop constraint if exists fatture_emesse_tipo_scadenza_unica_check;
alter table public.fatture_emesse
  add constraint fatture_emesse_tipo_scadenza_unica_check
  check (
    tipo_scadenza_unica is null
    or tipo_scadenza_unica in (
      'anticipato',
      'alla_consegna',
      'pronto_magazzino',
      'posticipato'
    )
  );

comment on column public.fatture_emesse.invio_email is
  'Destinatario mail di cortesia scelto in emissione A4';
comment on column public.fatture_emesse.sent_at is
  'Quando la fattura è stata inviata (mail + FiC/SDI)';

-- ---------------------------------------------------------------------------
-- fatture_emesse_dilazioni: tipo prima rata
-- ---------------------------------------------------------------------------
alter table public.fatture_emesse_dilazioni
  add column if not exists tipo_scadenza text;

alter table public.fatture_emesse_dilazioni drop constraint if exists fatture_emesse_dilazioni_tipo_scadenza_check;
alter table public.fatture_emesse_dilazioni
  add constraint fatture_emesse_dilazioni_tipo_scadenza_check
  check (
    tipo_scadenza is null
    or tipo_scadenza in (
      'anticipato',
      'alla_consegna',
      'pronto_magazzino',
      'posticipato'
    )
  );
