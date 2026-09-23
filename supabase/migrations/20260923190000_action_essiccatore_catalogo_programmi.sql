-- Action Essiccatori: azioni registrate, programmate, processi (insieme di registrate).
-- ISO 9001 §8.5.2 / 7.5: audit, soft delete, versione, stato documento. Mai delete fisico.

-- ---------------------------------------------------------------------------
-- Catalogo azioni registrate (riutilizzabili)
-- ---------------------------------------------------------------------------
create table if not exists public.action_essiccatore_registrate (
  id uuid primary key default gen_random_uuid(),
  essiccatore_id text not null,
  azione_key text not null default 'avvio',
  nome text not null,
  descrizione text not null default '',
  temp_bruciatore_c integer not null default 50,
  perc_ventilazione integer not null default 70,
  versione integer not null default 1,
  documento_stato text not null default 'approvato',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  created_by uuid references auth.users (id) on delete set null,
  updated_by uuid references auth.users (id) on delete set null,
  deleted_at timestamptz,
  deleted_by uuid references auth.users (id) on delete set null,
  constraint action_ess_reg_ess_check check (
    essiccatore_id in ('ess-a', 'ess-b', 'ess-ultimo-stadio')
  ),
  constraint action_ess_reg_key_check check (azione_key in ('avvio')),
  constraint action_ess_reg_doc_check check (
    documento_stato in ('bozza', 'approvato', 'chiuso')
  ),
  constraint action_ess_reg_nome_len check (char_length(trim(nome)) between 2 and 120),
  constraint action_ess_reg_setpoint_check check (
    temp_bruciatore_c between 35 and 70
    and perc_ventilazione between 0 and 100
  )
);

create index if not exists action_ess_reg_ess_idx
  on public.action_essiccatore_registrate (essiccatore_id, nome)
  where deleted_at is null;

comment on table public.action_essiccatore_registrate is
  'Catalogo azioni riutilizzabili per essiccatore. Un processo è un insieme di queste azioni.';

drop trigger if exists action_ess_reg_updated_at on public.action_essiccatore_registrate;
create trigger action_ess_reg_updated_at
  before update on public.action_essiccatore_registrate
  for each row execute function public.set_updated_at();

alter table public.action_essiccatore_registrate enable row level security;

drop policy if exists action_ess_reg_all on public.action_essiccatore_registrate;
create policy action_ess_reg_all
  on public.action_essiccatore_registrate for all to authenticated
  using (
    public.has_area_access('action')
    or public.has_area_access('produzione')
    or public.is_superadmin()
  )
  with check (
    public.has_area_access('action') or public.is_superadmin()
  );

grant select, insert, update on table public.action_essiccatore_registrate to authenticated;
grant all on table public.action_essiccatore_registrate to postgres, service_role;
revoke delete on table public.action_essiccatore_registrate from authenticated;

-- ---------------------------------------------------------------------------
-- Azioni programmate (esecuzione futura di una registrata)
-- ---------------------------------------------------------------------------
create table if not exists public.action_essiccatore_programmate (
  id uuid primary key default gen_random_uuid(),
  essiccatore_id text not null,
  registrata_id uuid not null references public.action_essiccatore_registrate (id),
  esegui_at timestamptz not null,
  stato text not null default 'programmata',
  azione_esecuzione_id uuid references public.action_essiccatore_azioni (id) on delete set null,
  versione integer not null default 1,
  documento_stato text not null default 'approvato',
  note text not null default '',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  created_by uuid references auth.users (id) on delete set null,
  updated_by uuid references auth.users (id) on delete set null,
  deleted_at timestamptz,
  deleted_by uuid references auth.users (id) on delete set null,
  constraint action_ess_prog_ess_check check (
    essiccatore_id in ('ess-a', 'ess-b', 'ess-ultimo-stadio')
  ),
  constraint action_ess_prog_stato_check check (
    stato in ('programmata', 'in_corso', 'eseguita', 'annullata', 'errore')
  ),
  constraint action_ess_prog_doc_check check (
    documento_stato in ('bozza', 'approvato', 'chiuso')
  )
);

create index if not exists action_ess_prog_ess_idx
  on public.action_essiccatore_programmate (essiccatore_id, esegui_at)
  where deleted_at is null;

comment on table public.action_essiccatore_programmate is
  'Programmazione di un’azione registrata su essiccatore (data/ora). Soft delete + audit.';

drop trigger if exists action_ess_prog_updated_at on public.action_essiccatore_programmate;
create trigger action_ess_prog_updated_at
  before update on public.action_essiccatore_programmate
  for each row execute function public.set_updated_at();

alter table public.action_essiccatore_programmate enable row level security;

drop policy if exists action_ess_prog_all on public.action_essiccatore_programmate;
create policy action_ess_prog_all
  on public.action_essiccatore_programmate for all to authenticated
  using (
    public.has_area_access('action')
    or public.has_area_access('produzione')
    or public.is_superadmin()
  )
  with check (
    public.has_area_access('action') or public.is_superadmin()
  );

grant select, insert, update on table public.action_essiccatore_programmate to authenticated;
grant all on table public.action_essiccatore_programmate to postgres, service_role;
revoke delete on table public.action_essiccatore_programmate from authenticated;

-- ---------------------------------------------------------------------------
-- Processi = insieme ordinato di azioni registrate
-- ---------------------------------------------------------------------------
create table if not exists public.action_essiccatore_processi (
  id uuid primary key default gen_random_uuid(),
  essiccatore_id text not null,
  nome text not null,
  descrizione text not null default '',
  versione integer not null default 1,
  documento_stato text not null default 'approvato',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  created_by uuid references auth.users (id) on delete set null,
  updated_by uuid references auth.users (id) on delete set null,
  deleted_at timestamptz,
  deleted_by uuid references auth.users (id) on delete set null,
  constraint action_ess_proc_ess_check check (
    essiccatore_id in ('ess-a', 'ess-b', 'ess-ultimo-stadio')
  ),
  constraint action_ess_proc_doc_check check (
    documento_stato in ('bozza', 'approvato', 'chiuso')
  ),
  constraint action_ess_proc_nome_len check (char_length(trim(nome)) between 2 and 120)
);

create index if not exists action_ess_proc_ess_idx
  on public.action_essiccatore_processi (essiccatore_id, nome)
  where deleted_at is null;

comment on table public.action_essiccatore_processi is
  'Processo Action: insieme di azioni registrate in sequenza su un essiccatore.';

drop trigger if exists action_ess_proc_updated_at on public.action_essiccatore_processi;
create trigger action_ess_proc_updated_at
  before update on public.action_essiccatore_processi
  for each row execute function public.set_updated_at();

alter table public.action_essiccatore_processi enable row level security;

drop policy if exists action_ess_proc_all on public.action_essiccatore_processi;
create policy action_ess_proc_all
  on public.action_essiccatore_processi for all to authenticated
  using (
    public.has_area_access('action')
    or public.has_area_access('produzione')
    or public.is_superadmin()
  )
  with check (
    public.has_area_access('action') or public.is_superadmin()
  );

grant select, insert, update on table public.action_essiccatore_processi to authenticated;
grant all on table public.action_essiccatore_processi to postgres, service_role;
revoke delete on table public.action_essiccatore_processi from authenticated;

create table if not exists public.action_essiccatore_processi_passi (
  id uuid primary key default gen_random_uuid(),
  processo_id uuid not null references public.action_essiccatore_processi (id),
  registrata_id uuid not null references public.action_essiccatore_registrate (id),
  sort_order integer not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  created_by uuid references auth.users (id) on delete set null,
  updated_by uuid references auth.users (id) on delete set null,
  deleted_at timestamptz,
  deleted_by uuid references auth.users (id) on delete set null
);

create unique index if not exists action_ess_proc_passi_ord_uidx
  on public.action_essiccatore_processi_passi (processo_id, sort_order)
  where deleted_at is null;

comment on table public.action_essiccatore_processi_passi is
  'Passi di un processo: almeno due azioni registrate, in ordine.';

drop trigger if exists action_ess_proc_passi_updated_at
  on public.action_essiccatore_processi_passi;
create trigger action_ess_proc_passi_updated_at
  before update on public.action_essiccatore_processi_passi
  for each row execute function public.set_updated_at();

alter table public.action_essiccatore_processi_passi enable row level security;

drop policy if exists action_ess_proc_passi_all on public.action_essiccatore_processi_passi;
create policy action_ess_proc_passi_all
  on public.action_essiccatore_processi_passi for all to authenticated
  using (
    public.has_area_access('action')
    or public.has_area_access('produzione')
    or public.is_superadmin()
  )
  with check (
    public.has_area_access('action') or public.is_superadmin()
  );

grant select, insert, update on table public.action_essiccatore_processi_passi to authenticated;
grant all on table public.action_essiccatore_processi_passi to postgres, service_role;
revoke delete on table public.action_essiccatore_processi_passi from authenticated;
