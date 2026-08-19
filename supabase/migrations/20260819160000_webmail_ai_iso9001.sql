-- Webmail multi-provider (Gmail/Aruba) + AI bozze — ISO 9001

-- Scheda tecnica PDF su prodotti propri
alter table public.prodotti_propri
  add column if not exists scheda_tecnica_path text not null default '';

alter table public.prodotti_propri
  add column if not exists prezzo_listino numeric(12, 4);

comment on column public.prodotti_propri.scheda_tecnica_path is
  'Path Storage PDF scheda tecnica (bucket prodotti-schede)';
comment on column public.prodotti_propri.prezzo_listino is
  'Prezzo listino cooperativa per preventivi AI (EUR, IVA esclusa se non indicato in note)';

-- Categorie di smistamento
create table if not exists public.webmail_categorie (
  id uuid primary key default gen_random_uuid(),
  codice text not null,
  nome text not null,
  descrizione text not null default '',
  colore text not null default '#64748b',
  is_system boolean not null default false,
  sort_order integer not null default 100,
  created_by uuid references auth.users (id) on delete set null,
  updated_by uuid references auth.users (id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz,
  deleted_by uuid references auth.users (id) on delete set null,
  constraint webmail_categorie_codice_check
    check (codice ~* '^[a-z][a-z0-9_]{1,40}$')
);

create unique index if not exists webmail_categorie_codice_uidx
  on public.webmail_categorie (lower(codice))
  where deleted_at is null;

drop trigger if exists webmail_categorie_updated_at on public.webmail_categorie;
create trigger webmail_categorie_updated_at
  before update on public.webmail_categorie
  for each row execute function public.set_updated_at();

alter table public.webmail_categorie enable row level security;

drop policy if exists "webmail_categorie_select" on public.webmail_categorie;
create policy "webmail_categorie_select"
  on public.webmail_categorie for select to authenticated
  using (
    public.has_area_access('commerciale')
    or public.has_area_access('amministrazione')
    or public.is_superadmin()
  );

drop policy if exists "webmail_categorie_write" on public.webmail_categorie;
create policy "webmail_categorie_write"
  on public.webmail_categorie for all to authenticated
  using (public.is_superadmin() or public.has_area_access('amministrazione'))
  with check (public.is_superadmin() or public.has_area_access('amministrazione'));

grant select on table public.webmail_categorie to authenticated;
grant all on table public.webmail_categorie to postgres, service_role;

-- Account casella (Aruba / Gmail / generico)
create table if not exists public.webmail_accounts (
  id uuid primary key default gen_random_uuid(),
  label text not null,
  email_address text not null,
  provider text not null
    check (provider in ('aruba', 'gmail', 'generic')),
  imap_host text not null,
  imap_port integer not null default 993,
  imap_secure boolean not null default true,
  smtp_host text not null,
  smtp_port integer not null default 465,
  smtp_secure boolean not null default true,
  username text not null,
  password_encrypted text not null,
  sync_enabled boolean not null default true,
  last_sync_at timestamptz,
  last_sync_error text,
  created_by uuid references auth.users (id) on delete set null,
  updated_by uuid references auth.users (id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz,
  deleted_by uuid references auth.users (id) on delete set null
);

create unique index if not exists webmail_accounts_email_uidx
  on public.webmail_accounts (lower(email_address))
  where deleted_at is null;

drop trigger if exists webmail_accounts_updated_at on public.webmail_accounts;
create trigger webmail_accounts_updated_at
  before update on public.webmail_accounts
  for each row execute function public.set_updated_at();

alter table public.webmail_accounts enable row level security;

drop policy if exists "webmail_accounts_select" on public.webmail_accounts;
create policy "webmail_accounts_select"
  on public.webmail_accounts for select to authenticated
  using (
    public.has_area_access('commerciale')
    or public.has_area_access('amministrazione')
    or public.is_superadmin()
  );

drop policy if exists "webmail_accounts_write" on public.webmail_accounts;
create policy "webmail_accounts_write"
  on public.webmail_accounts for all to authenticated
  using (public.is_superadmin() or public.has_area_access('amministrazione'))
  with check (public.is_superadmin() or public.has_area_access('amministrazione'));

grant select on table public.webmail_accounts to authenticated;
grant insert, update on table public.webmail_accounts to authenticated;
grant all on table public.webmail_accounts to postgres, service_role;
revoke delete on table public.webmail_accounts from authenticated;

-- Messaggi mirrored
create table if not exists public.webmail_messaggi (
  id uuid primary key default gen_random_uuid(),
  account_id uuid not null references public.webmail_accounts (id) on delete cascade,
  categoria_id uuid references public.webmail_categorie (id) on delete set null,
  direction text not null check (direction in ('inbound', 'outbound')),
  message_uid text not null,
  message_id_header text,
  folder text not null default 'INBOX',
  from_address text not null default '',
  from_name text not null default '',
  to_addresses text[] not null default '{}'::text[],
  cc_addresses text[] not null default '{}'::text[],
  subject text not null default '',
  body_text text not null default '',
  body_html text not null default '',
  received_at timestamptz,
  sent_at timestamptz,
  is_seen boolean not null default false,
  ai_intent text
    check (
      ai_intent is null
      or ai_intent in (
        'scheda_tecnica',
        'preventivo_listino',
        'ordine_lotto',
        'generico',
        'da_revisionare',
        'scartate'
      )
    ),
  ai_confidence numeric(5, 2),
  ai_processed_at timestamptz,
  has_ai_draft boolean not null default false,
  created_by uuid references auth.users (id) on delete set null,
  updated_by uuid references auth.users (id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz,
  deleted_by uuid references auth.users (id) on delete set null
);

create unique index if not exists webmail_messaggi_account_uid_uidx
  on public.webmail_messaggi (account_id, folder, message_uid)
  where deleted_at is null;

create index if not exists webmail_messaggi_categoria_idx
  on public.webmail_messaggi (categoria_id)
  where deleted_at is null;

create index if not exists webmail_messaggi_received_idx
  on public.webmail_messaggi (received_at desc nulls last)
  where deleted_at is null;

create index if not exists webmail_messaggi_ai_draft_idx
  on public.webmail_messaggi (has_ai_draft)
  where deleted_at is null and has_ai_draft = true;

drop trigger if exists webmail_messaggi_updated_at on public.webmail_messaggi;
create trigger webmail_messaggi_updated_at
  before update on public.webmail_messaggi
  for each row execute function public.set_updated_at();

alter table public.webmail_messaggi enable row level security;

drop policy if exists "webmail_messaggi_all" on public.webmail_messaggi;
create policy "webmail_messaggi_all"
  on public.webmail_messaggi for all to authenticated
  using (
    public.has_area_access('commerciale')
    or public.has_area_access('amministrazione')
    or public.is_superadmin()
  )
  with check (
    public.has_area_access('commerciale')
    or public.has_area_access('amministrazione')
    or public.is_superadmin()
  );

grant select, insert, update on table public.webmail_messaggi to authenticated;
grant all on table public.webmail_messaggi to postgres, service_role;
revoke delete on table public.webmail_messaggi from authenticated;

-- Bozze AI (mai inviate automaticamente)
create table if not exists public.webmail_bozze_ai (
  id uuid primary key default gen_random_uuid(),
  messaggio_id uuid not null references public.webmail_messaggi (id) on delete cascade,
  account_id uuid not null references public.webmail_accounts (id) on delete cascade,
  versione integer not null default 1,
  documento_stato text not null default 'bozza'
    check (documento_stato in ('bozza', 'approvata', 'inviata', 'scartata')),
  to_address text not null,
  subject text not null default '',
  body_text text not null default '',
  body_html text not null default '',
  intent text not null default 'generico',
  confidence numeric(5, 2),
  model_name text not null default '',
  rag_notes text not null default '',
  approved_by uuid references auth.users (id) on delete set null,
  approved_at timestamptz,
  sent_at timestamptz,
  ai_generated boolean not null default true,
  created_by uuid references auth.users (id) on delete set null,
  updated_by uuid references auth.users (id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz,
  deleted_by uuid references auth.users (id) on delete set null
);

create unique index if not exists webmail_bozze_ai_messaggio_active_uidx
  on public.webmail_bozze_ai (messaggio_id)
  where deleted_at is null and documento_stato in ('bozza', 'approvata');

drop trigger if exists webmail_bozze_ai_updated_at on public.webmail_bozze_ai;
create trigger webmail_bozze_ai_updated_at
  before update on public.webmail_bozze_ai
  for each row execute function public.set_updated_at();

alter table public.webmail_bozze_ai enable row level security;

drop policy if exists "webmail_bozze_ai_all" on public.webmail_bozze_ai;
create policy "webmail_bozze_ai_all"
  on public.webmail_bozze_ai for all to authenticated
  using (
    public.has_area_access('commerciale')
    or public.has_area_access('amministrazione')
    or public.is_superadmin()
  )
  with check (
    public.has_area_access('commerciale')
    or public.has_area_access('amministrazione')
    or public.is_superadmin()
  );

grant select, insert, update on table public.webmail_bozze_ai to authenticated;
grant all on table public.webmail_bozze_ai to postgres, service_role;
revoke delete on table public.webmail_bozze_ai from authenticated;

-- Allegati bozza (path storage o riferimento prodotto)
create table if not exists public.webmail_bozze_allegati (
  id uuid primary key default gen_random_uuid(),
  bozza_id uuid not null references public.webmail_bozze_ai (id) on delete cascade,
  file_name text not null,
  storage_path text not null default '',
  content_type text not null default 'application/pdf',
  source text not null default 'manuale'
    check (source in ('scheda_tecnica', 'manuale', 'generato')),
  prodotto_id uuid references public.prodotti_propri (id) on delete set null,
  created_by uuid references auth.users (id) on delete set null,
  updated_by uuid references auth.users (id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz,
  deleted_by uuid references auth.users (id) on delete set null
);

create index if not exists webmail_bozze_allegati_bozza_idx
  on public.webmail_bozze_allegati (bozza_id)
  where deleted_at is null;

drop trigger if exists webmail_bozze_allegati_updated_at on public.webmail_bozze_allegati;
create trigger webmail_bozze_allegati_updated_at
  before update on public.webmail_bozze_allegati
  for each row execute function public.set_updated_at();

alter table public.webmail_bozze_allegati enable row level security;

drop policy if exists "webmail_bozze_allegati_all" on public.webmail_bozze_allegati;
create policy "webmail_bozze_allegati_all"
  on public.webmail_bozze_allegati for all to authenticated
  using (
    public.has_area_access('commerciale')
    or public.has_area_access('amministrazione')
    or public.is_superadmin()
  )
  with check (
    public.has_area_access('commerciale')
    or public.has_area_access('amministrazione')
    or public.is_superadmin()
  );

grant select, insert, update on table public.webmail_bozze_allegati to authenticated;
grant all on table public.webmail_bozze_allegati to postgres, service_role;
revoke delete on table public.webmail_bozze_allegati from authenticated;

-- Activity trail (equivalente company_activities per mail AI)
create table if not exists public.webmail_ai_elaborazioni (
  id uuid primary key default gen_random_uuid(),
  messaggio_id uuid references public.webmail_messaggi (id) on delete set null,
  bozza_id uuid references public.webmail_bozze_ai (id) on delete set null,
  account_id uuid references public.webmail_accounts (id) on delete set null,
  action text not null
    check (action in (
      'sync',
      'classified',
      'draft_created',
      'draft_edited',
      'approved',
      'sent',
      'discarded'
    )),
  ai_generated boolean not null default false,
  approved_by uuid references auth.users (id) on delete set null,
  sent_at timestamptz,
  summary text not null default '',
  payload jsonb not null default '{}'::jsonb,
  created_by uuid references auth.users (id) on delete set null,
  updated_by uuid references auth.users (id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz,
  deleted_by uuid references auth.users (id) on delete set null
);

create index if not exists webmail_ai_elaborazioni_msg_idx
  on public.webmail_ai_elaborazioni (messaggio_id)
  where deleted_at is null;

drop trigger if exists webmail_ai_elaborazioni_updated_at on public.webmail_ai_elaborazioni;
create trigger webmail_ai_elaborazioni_updated_at
  before update on public.webmail_ai_elaborazioni
  for each row execute function public.set_updated_at();

alter table public.webmail_ai_elaborazioni enable row level security;

drop policy if exists "webmail_ai_elaborazioni_all" on public.webmail_ai_elaborazioni;
create policy "webmail_ai_elaborazioni_all"
  on public.webmail_ai_elaborazioni for all to authenticated
  using (
    public.has_area_access('commerciale')
    or public.has_area_access('amministrazione')
    or public.is_superadmin()
  )
  with check (
    public.has_area_access('commerciale')
    or public.has_area_access('amministrazione')
    or public.is_superadmin()
  );

grant select, insert on table public.webmail_ai_elaborazioni to authenticated;
grant all on table public.webmail_ai_elaborazioni to postgres, service_role;
revoke update, delete on table public.webmail_ai_elaborazioni from authenticated;

-- Fix seed categorie: insert senza on conflict se no unique hit for DO NOTHING on nothing
-- (unique index partial — use not exists)
insert into public.webmail_categorie (codice, nome, descrizione, colore, is_system, sort_order)
select v.codice, v.nome, v.descrizione, v.colore, true, v.sort_order
from (values
  ('scheda_tecnica', 'Scheda tecnica', 'Richiesta scheda tecnica prodotto', '#0ea5e9', 10),
  ('preventivo_listino', 'Preventivo / listino', 'Richiesta quotazione o listino', '#16a34a', 20),
  ('ordine_lotto', 'Ordine / lotto', 'Informazioni ordine o lotto', '#ca8a04', 30),
  ('generico', 'Generico', 'Altre comunicazioni', '#64748b', 40),
  ('da_revisionare', 'Da revisionare', 'Confidence bassa o ambigua', '#ea580c', 50),
  ('scartate', 'Scartate', 'Spam / non pertinenti', '#94a3b8', 60)
) as v(codice, nome, descrizione, colore, sort_order)
where not exists (
  select 1 from public.webmail_categorie c
  where lower(c.codice) = lower(v.codice) and c.deleted_at is null
);
