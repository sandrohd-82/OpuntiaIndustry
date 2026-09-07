-- Area Script: funzioni del gestionale (es. Pesata) collegabili alle attività.
-- Esecuzione processo sul foglio + registro pesate immutabile (ISO 9001).

-- ---------------------------------------------------------------------------
-- Area menu
-- ---------------------------------------------------------------------------
insert into public.areas (slug, name, description, icon, sort_order, is_active)
values (
  'script',
  'Script',
  'Funzioni del gestionale collegabili alle attività (es. raccolta pesata)',
  'code',
  25,
  true
)
on conflict (slug) do update
set
  name = excluded.name,
  description = excluded.description,
  icon = excluded.icon,
  sort_order = excluded.sort_order,
  is_active = true;

insert into public.role_area_permissions (role_id, area_id, can_access)
select r.id, a.id, true
from public.app_roles r
cross join public.areas a
where a.slug = 'script'
  and r.code in ('superadmin', 'admin', 'manager', 'operator')
on conflict (role_id, area_id) do update set can_access = true;

-- ---------------------------------------------------------------------------
-- Catalogo script
-- ---------------------------------------------------------------------------
create table if not exists public.gestionale_script (
  id uuid primary key default gen_random_uuid(),
  codice text not null,
  nome text not null,
  descrizione text not null default '',
  funzione text not null default 'pesata'
    check (funzione in ('pesata')),
  attivo boolean not null default true,
  note text not null default '',
  versione integer not null default 1,
  documento_stato text not null default 'bozza'
    check (documento_stato in ('bozza', 'approvato', 'chiuso')),
  approvato_at timestamptz,
  approvato_by uuid references auth.users (id) on delete set null,
  created_by uuid references auth.users (id) on delete set null,
  updated_by uuid references auth.users (id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz,
  deleted_by uuid references auth.users (id) on delete set null
);

create unique index if not exists gestionale_script_codice_lower_uidx
  on public.gestionale_script (lower(codice))
  where deleted_at is null;

comment on table public.gestionale_script is
  'Funzioni del gestionale (ISO 9001) — es. Pesata: richiede e salva un peso.';

drop trigger if exists gestionale_script_updated_at on public.gestionale_script;
create trigger gestionale_script_updated_at
  before update on public.gestionale_script
  for each row execute function public.set_updated_at();

alter table public.gestionale_script enable row level security;
drop policy if exists gestionale_script_all on public.gestionale_script;
create policy gestionale_script_all
  on public.gestionale_script for all to authenticated
  using (
    public.has_area_access('script')
    or public.has_area_access('produzione')
    or public.has_area_access('amministrazione')
    or public.is_superadmin()
  )
  with check (
    public.has_area_access('script')
    or public.has_area_access('produzione')
    or public.has_area_access('amministrazione')
    or public.is_superadmin()
  );
grant select, insert, update on table public.gestionale_script to authenticated;
grant all on table public.gestionale_script to postgres, service_role;
revoke delete on table public.gestionale_script from authenticated;

-- ---------------------------------------------------------------------------
-- Attività ↔ script (N:M)
-- ---------------------------------------------------------------------------
create table if not exists public.produzione_processo_attivita_script (
  id uuid primary key default gen_random_uuid(),
  attivita_id uuid not null
    references public.produzione_processo_attivita (id) on delete restrict,
  script_id uuid not null
    references public.gestionale_script (id) on delete restrict,
  sort_order integer not null default 0,
  created_by uuid references auth.users (id) on delete set null,
  updated_by uuid references auth.users (id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz,
  deleted_by uuid references auth.users (id) on delete set null
);

create unique index if not exists produzione_processo_attivita_script_open_uidx
  on public.produzione_processo_attivita_script (attivita_id, script_id)
  where deleted_at is null;

drop trigger if exists produzione_processo_attivita_script_updated_at
  on public.produzione_processo_attivita_script;
create trigger produzione_processo_attivita_script_updated_at
  before update on public.produzione_processo_attivita_script
  for each row execute function public.set_updated_at();

alter table public.produzione_processo_attivita_script enable row level security;
drop policy if exists produzione_processo_attivita_script_all
  on public.produzione_processo_attivita_script;
create policy produzione_processo_attivita_script_all
  on public.produzione_processo_attivita_script for all to authenticated
  using (
    public.has_area_access('produzione')
    or public.has_area_access('script')
    or public.has_area_access('amministrazione')
    or public.is_superadmin()
  )
  with check (
    public.has_area_access('produzione')
    or public.has_area_access('script')
    or public.has_area_access('amministrazione')
    or public.is_superadmin()
  );
grant select, insert, update on table public.produzione_processo_attivita_script to authenticated;
grant all on table public.produzione_processo_attivita_script to postgres, service_role;
revoke delete on table public.produzione_processo_attivita_script from authenticated;

-- ---------------------------------------------------------------------------
-- Esecuzione processo sul foglio
-- ---------------------------------------------------------------------------
create table if not exists public.produzione_foglio_processi (
  id uuid primary key default gen_random_uuid(),
  foglio_id uuid not null
    references public.produzione_fogli_lavorazione (id) on delete restrict,
  processo_id uuid not null
    references public.produzione_processi (id) on delete restrict,
  stato text not null default 'in_corso'
    check (stato in ('in_corso', 'completato', 'annullato')),
  kg_obiettivo numeric(14, 3) not null default 0 check (kg_obiettivo >= 0),
  started_at timestamptz not null default now(),
  completed_at timestamptz,
  created_by uuid references auth.users (id) on delete set null,
  updated_by uuid references auth.users (id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz,
  deleted_by uuid references auth.users (id) on delete set null
);

create unique index if not exists produzione_foglio_processi_open_uidx
  on public.produzione_foglio_processi (foglio_id, processo_id)
  where deleted_at is null;

create index if not exists produzione_foglio_processi_foglio_idx
  on public.produzione_foglio_processi (foglio_id)
  where deleted_at is null;

comment on table public.produzione_foglio_processi is
  'Avvio di un processo sul foglio giornaliero (ISO 9001).';

drop trigger if exists produzione_foglio_processi_updated_at
  on public.produzione_foglio_processi;
create trigger produzione_foglio_processi_updated_at
  before update on public.produzione_foglio_processi
  for each row execute function public.set_updated_at();

alter table public.produzione_foglio_processi enable row level security;
drop policy if exists produzione_foglio_processi_all
  on public.produzione_foglio_processi;
create policy produzione_foglio_processi_all
  on public.produzione_foglio_processi for all to authenticated
  using (
    public.has_area_access('produzione')
    or public.has_area_access('amministrazione')
    or public.is_superadmin()
  )
  with check (
    public.has_area_access('produzione')
    or public.has_area_access('amministrazione')
    or public.is_superadmin()
  );
grant select, insert, update on table public.produzione_foglio_processi to authenticated;
grant all on table public.produzione_foglio_processi to postgres, service_role;
revoke delete on table public.produzione_foglio_processi from authenticated;

-- ---------------------------------------------------------------------------
-- Registro pesate (immutabile)
-- ---------------------------------------------------------------------------
create table if not exists public.produzione_foglio_pesate (
  id uuid primary key default gen_random_uuid(),
  esecuzione_id uuid not null
    references public.produzione_foglio_processi (id) on delete restrict,
  foglio_id uuid not null
    references public.produzione_fogli_lavorazione (id) on delete restrict,
  processo_id uuid not null
    references public.produzione_processi (id) on delete restrict,
  attivita_id uuid not null
    references public.produzione_processo_attivita (id) on delete restrict,
  script_id uuid not null
    references public.gestionale_script (id) on delete restrict,
  kg numeric(14, 3) not null check (kg > 0),
  created_by uuid references auth.users (id) on delete set null,
  created_at timestamptz not null default now()
);

create index if not exists produzione_foglio_pesate_esec_idx
  on public.produzione_foglio_pesate (esecuzione_id, created_at);

comment on table public.produzione_foglio_pesate is
  'Registro immutabile delle pesate (ISO 9001 8.5.2). Mai delete fisico.';

alter table public.produzione_foglio_pesate enable row level security;
drop policy if exists produzione_foglio_pesate_select on public.produzione_foglio_pesate;
create policy produzione_foglio_pesate_select
  on public.produzione_foglio_pesate for select to authenticated
  using (
    public.has_area_access('produzione')
    or public.has_area_access('amministrazione')
    or public.is_superadmin()
  );
drop policy if exists produzione_foglio_pesate_insert on public.produzione_foglio_pesate;
create policy produzione_foglio_pesate_insert
  on public.produzione_foglio_pesate for insert to authenticated
  with check (
    public.has_area_access('produzione')
    or public.has_area_access('amministrazione')
    or public.is_superadmin()
  );
grant select, insert on table public.produzione_foglio_pesate to authenticated;
grant all on table public.produzione_foglio_pesate to postgres, service_role;
revoke update, delete on table public.produzione_foglio_pesate from authenticated;

-- ---------------------------------------------------------------------------
-- Seed: Pesata + Caricamento Pesata + Rifornimento Vasca
-- ---------------------------------------------------------------------------
insert into public.gestionale_script (
  codice, nome, descrizione, funzione, attivo, documento_stato, versione
)
select
  'SCR-PESATA',
  'Pesata',
  'Richiede e salva un peso sul foglio di lavorazione. Le pesate si sommano fino al totale da caricare.',
  'pesata',
  true,
  'approvato',
  1
where not exists (
  select 1 from public.gestionale_script s
  where s.deleted_at is null and lower(s.codice) = 'scr-pesata'
);

insert into public.produzione_processo_attivita (
  codice, nome, descrizione, attivo, area_id
)
select
  'AP-CARICAMENTO-PESATA',
  'Caricamento Pesata',
  'Passaggio obbligatorio: il gestionale richiede e salva la pesata.',
  true,
  a.id
from public.produzione_aree a
where a.codice = 'lavaggio'
  and a.deleted_at is null
  and not exists (
    select 1 from public.produzione_processo_attivita x
    where x.deleted_at is null and lower(x.codice) = 'ap-caricamento-pesata'
  );

update public.produzione_processo_attivita x
set
  area_id = a.id,
  descrizione = case
    when x.descrizione = '' then
      'Passaggio obbligatorio: il gestionale richiede e salva la pesata.'
    else x.descrizione
  end,
  updated_at = now()
from public.produzione_aree a
where a.codice = 'lavaggio'
  and a.deleted_at is null
  and x.deleted_at is null
  and lower(x.codice) = 'ap-caricamento-pesata'
  and (x.area_id is distinct from a.id or x.descrizione = '');

insert into public.produzione_processo_attivita_script (attivita_id, script_id, sort_order)
select at.id, sc.id, 1
from public.produzione_processo_attivita at
join public.gestionale_script sc
  on sc.deleted_at is null and lower(sc.codice) = 'scr-pesata'
where at.deleted_at is null
  and lower(at.codice) = 'ap-caricamento-pesata'
  and not exists (
    select 1
    from public.produzione_processo_attivita_script l
    where l.attivita_id = at.id
      and l.script_id = sc.id
      and l.deleted_at is null
  );

insert into public.produzione_processi (
  codice, nome, descrizione, attivo, versione, documento_stato, area_id
)
select
  'PX-RIF-VASCA-BINS',
  'Rifornimento Vasca di Lavaggio Bins',
  'Processo sul foglio giornaliero: elenca i passi e attende la pesata fino al totale caricato.',
  true,
  1,
  'approvato',
  a.id
from public.produzione_aree a
where a.codice = 'lavaggio'
  and a.deleted_at is null
  and not exists (
    select 1 from public.produzione_processi p
    where p.deleted_at is null and lower(p.codice) = 'px-rif-vasca-bins'
  );

update public.produzione_processi p
set
  area_id = a.id,
  approvato_at = coalesce(p.approvato_at, now()),
  documento_stato = case
    when p.documento_stato = 'chiuso' then p.documento_stato
    else 'approvato'
  end,
  updated_at = now()
from public.produzione_aree a
where a.codice = 'lavaggio'
  and a.deleted_at is null
  and p.deleted_at is null
  and lower(p.codice) = 'px-rif-vasca-bins'
  and p.area_id is distinct from a.id;

insert into public.produzione_processo_passi (
  processo_id, attivita_id, sort_order, obbligatorio
)
select pr.id, at.id, 1, true
from public.produzione_processi pr
join public.produzione_processo_attivita at
  on at.deleted_at is null and lower(at.codice) = 'ap-caricamento-pesata'
where pr.deleted_at is null
  and lower(pr.codice) = 'px-rif-vasca-bins'
  and not exists (
    select 1 from public.produzione_processo_passi s
    where s.processo_id = pr.id
      and s.attivita_id = at.id
      and s.deleted_at is null
  );
