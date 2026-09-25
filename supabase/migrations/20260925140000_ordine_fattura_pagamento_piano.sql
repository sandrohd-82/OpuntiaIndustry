-- Piano pagamento ordine + tracciabilità invio fattura A4 → FiC/SDI
-- Idempotente e anti-deadlock: niente DROP+ADD nello stesso giro su più tabelle,
-- CHECK aggiunti NOT VALID, un solo ALTER per tabella.

set local lock_timeout = '15s';
set local statement_timeout = '60s';
set local deadlock_timeout = '1s';

-- ---------------------------------------------------------------------------
-- 1) ordini: colonna + check (senza toccare fatture)
-- ---------------------------------------------------------------------------
alter table public.ordini
  add column if not exists pagamento_modalita text not null default 'unica';

do $$
begin
  if not exists (
    select 1 from pg_constraint
    where conname = 'ordini_pagamento_modalita_check'
  ) then
    alter table public.ordini
      add constraint ordini_pagamento_modalita_check
      check (pagamento_modalita in ('unica', 'dilazione')) not valid;
  end if;
end $$;

do $$
declare
  def text;
begin
  select pg_get_constraintdef(oid) into def
  from pg_constraint
  where conname = 'ordini_tipo_pagamento_check'
  limit 1;

  if def is null then
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
      ) not valid;
  elsif def not ilike '%pronto_magazzino%' then
    alter table public.ordini drop constraint ordini_tipo_pagamento_check;
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
      ) not valid;
  end if;
end $$;

comment on column public.ordini.pagamento_modalita is
  'unica = una scadenza; dilazione = più rate (tipo_pagamento = dilazionato)';
comment on column public.ordini.tipo_pagamento is
  'Unica: anticipato | alla_consegna | pronto_magazzino | posticipato. Dilazione: dilazionato';

-- ---------------------------------------------------------------------------
-- 2) tabella rate (FK su ordini già chiuso sopra)
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
-- 3) fatture_emesse (dopo aver rilasciato i lock su ordini)
-- ---------------------------------------------------------------------------
alter table public.fatture_emesse
  add column if not exists invio_email text not null default '',
  add column if not exists sent_at timestamptz,
  add column if not exists sent_by uuid references auth.users (id) on delete set null,
  add column if not exists pagamento_modalita text not null default 'unica',
  add column if not exists tipo_scadenza_unica text;

do $$
begin
  if not exists (
    select 1 from pg_constraint
    where conname = 'fatture_emesse_pagamento_modalita_check'
  ) then
    alter table public.fatture_emesse
      add constraint fatture_emesse_pagamento_modalita_check
      check (pagamento_modalita in ('unica', 'dilazione')) not valid;
  end if;
end $$;

do $$
begin
  if not exists (
    select 1 from pg_constraint
    where conname = 'fatture_emesse_tipo_scadenza_unica_check'
  ) then
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
      ) not valid;
  end if;
end $$;

comment on column public.fatture_emesse.invio_email is
  'Destinatario mail di cortesia scelto in emissione A4';
comment on column public.fatture_emesse.sent_at is
  'Quando la fattura è stata inviata (mail + FiC/SDI)';

-- ---------------------------------------------------------------------------
-- 4) fatture_emesse_dilazioni
-- ---------------------------------------------------------------------------
alter table public.fatture_emesse_dilazioni
  add column if not exists tipo_scadenza text;

do $$
begin
  if not exists (
    select 1 from pg_constraint
    where conname = 'fatture_emesse_dilazioni_tipo_scadenza_check'
  ) then
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
      ) not valid;
  end if;
end $$;
