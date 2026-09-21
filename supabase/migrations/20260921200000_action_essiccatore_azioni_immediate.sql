-- Azioni immediate essiccatori (Action): Avvio con 4 settaggi e 4 messaggi IoT.
-- I dispositivi IoT saranno collegati in seguito: i messaggi restano in attesa.
-- ISO 9001: audit, soft delete, versione, stato documento. Mai delete fisico.

create table if not exists public.action_essiccatore_azioni (
  id uuid primary key default gen_random_uuid(),
  essiccatore_id text not null,
  azione_key text not null default 'avvio',
  versione integer not null default 1,
  documento_stato text not null default 'eseguito',
  consenso_bruciatore boolean not null,
  perc_bruciatore integer not null,
  consenso_ventola boolean not null,
  perc_ventilazione integer not null,
  iot_stato text not null default 'in_attesa_dispositivo',
  note text not null default '',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  created_by uuid references auth.users (id) on delete set null,
  updated_by uuid references auth.users (id) on delete set null,
  deleted_at timestamptz,
  deleted_by uuid references auth.users (id) on delete set null,
  constraint action_essiccatore_azioni_ess_check check (
    essiccatore_id in ('ess-a', 'ess-b', 'ess-ultimo-stadio')
  ),
  constraint action_essiccatore_azioni_key_check check (
    azione_key in ('avvio')
  ),
  constraint action_essiccatore_azioni_doc_check check (
    documento_stato in ('bozza', 'approvato', 'eseguito', 'errore')
  ),
  constraint action_essiccatore_azioni_iot_check check (
    iot_stato in ('in_attesa_dispositivo', 'accodato', 'inviato', 'errore')
  ),
  constraint action_essiccatore_azioni_perc_check check (
    perc_bruciatore between 0 and 100
    and perc_ventilazione between 0 and 100
  )
);

create index if not exists action_essiccatore_azioni_ess_idx
  on public.action_essiccatore_azioni (essiccatore_id, created_at desc)
  where deleted_at is null;

comment on table public.action_essiccatore_azioni is
  'Azioni immediate su essiccatore (es. Avvio). 4 settaggi; messaggi IoT in tabella figlia. Soft delete + audit.';

drop trigger if exists action_essiccatore_azioni_updated_at
  on public.action_essiccatore_azioni;
create trigger action_essiccatore_azioni_updated_at
  before update on public.action_essiccatore_azioni
  for each row execute function public.set_updated_at();

alter table public.action_essiccatore_azioni enable row level security;

drop policy if exists action_essiccatore_azioni_select
  on public.action_essiccatore_azioni;
create policy action_essiccatore_azioni_select
  on public.action_essiccatore_azioni for select to authenticated
  using (
    public.has_area_access('action')
    or public.has_area_access('produzione')
    or public.has_area_access('amministrazione')
    or public.is_superadmin()
  );

drop policy if exists action_essiccatore_azioni_insert
  on public.action_essiccatore_azioni;
create policy action_essiccatore_azioni_insert
  on public.action_essiccatore_azioni for insert to authenticated
  with check (
    public.has_area_access('action')
    or public.is_superadmin()
  );

drop policy if exists action_essiccatore_azioni_update
  on public.action_essiccatore_azioni;
create policy action_essiccatore_azioni_update
  on public.action_essiccatore_azioni for update to authenticated
  using (
    public.has_area_access('action')
    or public.is_superadmin()
  )
  with check (
    public.has_area_access('action')
    or public.is_superadmin()
  );

grant select, insert, update on table public.action_essiccatore_azioni
  to authenticated;
grant all on table public.action_essiccatore_azioni to postgres, service_role;
revoke delete on table public.action_essiccatore_azioni from authenticated;

create table if not exists public.action_essiccatore_iot_messaggi (
  id uuid primary key default gen_random_uuid(),
  azione_id uuid not null references public.action_essiccatore_azioni (id),
  canale text not null,
  comando text not null,
  payload jsonb not null default '{}'::jsonb,
  sort_order integer not null default 1,
  stato text not null default 'in_attesa_dispositivo',
  iot_command_id uuid,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  created_by uuid references auth.users (id) on delete set null,
  updated_by uuid references auth.users (id) on delete set null,
  deleted_at timestamptz,
  deleted_by uuid references auth.users (id) on delete set null,
  constraint action_essiccatore_iot_canale_check check (
    canale in (
      'consenso_bruciatore',
      'perc_bruciatore',
      'consenso_ventola',
      'perc_ventilazione'
    )
  ),
  constraint action_essiccatore_iot_stato_check check (
    stato in ('in_attesa_dispositivo', 'accodato', 'inviato', 'errore')
  ),
  constraint action_essiccatore_iot_cmd_len check (
    char_length(trim(comando)) between 1 and 80
  )
);

create unique index if not exists action_essiccatore_iot_canale_uidx
  on public.action_essiccatore_iot_messaggi (azione_id, canale)
  where deleted_at is null;

create index if not exists action_essiccatore_iot_azione_idx
  on public.action_essiccatore_iot_messaggi (azione_id, sort_order)
  where deleted_at is null;

comment on table public.action_essiccatore_iot_messaggi is
  'Quattro messaggi IoT per ogni Avvio essiccatore. iot_command_id si collegherà al dispositivo quando configurato.';

drop trigger if exists action_essiccatore_iot_messaggi_updated_at
  on public.action_essiccatore_iot_messaggi;
create trigger action_essiccatore_iot_messaggi_updated_at
  before update on public.action_essiccatore_iot_messaggi
  for each row execute function public.set_updated_at();

alter table public.action_essiccatore_iot_messaggi enable row level security;

drop policy if exists action_essiccatore_iot_select
  on public.action_essiccatore_iot_messaggi;
create policy action_essiccatore_iot_select
  on public.action_essiccatore_iot_messaggi for select to authenticated
  using (
    public.has_area_access('action')
    or public.has_area_access('produzione')
    or public.has_area_access('amministrazione')
    or public.is_superadmin()
  );

drop policy if exists action_essiccatore_iot_insert
  on public.action_essiccatore_iot_messaggi;
create policy action_essiccatore_iot_insert
  on public.action_essiccatore_iot_messaggi for insert to authenticated
  with check (
    public.has_area_access('action')
    or public.is_superadmin()
  );

drop policy if exists action_essiccatore_iot_update
  on public.action_essiccatore_iot_messaggi;
create policy action_essiccatore_iot_update
  on public.action_essiccatore_iot_messaggi for update to authenticated
  using (
    public.has_area_access('action')
    or public.is_superadmin()
  )
  with check (
    public.has_area_access('action')
    or public.is_superadmin()
  );

grant select, insert, update on table public.action_essiccatore_iot_messaggi
  to authenticated;
grant all on table public.action_essiccatore_iot_messaggi
  to postgres, service_role;
revoke delete on table public.action_essiccatore_iot_messaggi from authenticated;
