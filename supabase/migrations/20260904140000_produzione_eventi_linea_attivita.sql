-- Registro On/Off macchine + Eventi di linea (pause). ISO 9001 8.5.2.
-- Attività: insert-only, mai delete. Eventi: soft delete.

create table if not exists public.produzione_eventi_linea (
  id uuid primary key default gen_random_uuid(),
  area_id uuid not null references public.produzione_aree (id),
  tipo text not null
    check (tipo in ('pausa_caffe', 'pausa_pranzo', 'fine_turno', 'ripresa')),
  documento_stato text not null default 'in_corso'
    check (documento_stato in ('bozza', 'in_corso', 'chiuso')),
  versione integer not null default 1,
  note text not null default '',
  started_at timestamptz not null default now(),
  started_by uuid references auth.users (id) on delete set null,
  closed_at timestamptz,
  closed_by uuid references auth.users (id) on delete set null,
  created_by uuid references auth.users (id) on delete set null,
  updated_by uuid references auth.users (id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz,
  deleted_by uuid references auth.users (id) on delete set null
);

create index if not exists produzione_eventi_linea_area_aperti_idx
  on public.produzione_eventi_linea (area_id)
  where deleted_at is null and documento_stato = 'in_corso';

comment on table public.produzione_eventi_linea is
  'Eventi di linea (pausa caffè, pranzo, fine turno). Chiude quando le macchine richieste sono Off.';

drop trigger if exists produzione_eventi_linea_updated_at on public.produzione_eventi_linea;
create trigger produzione_eventi_linea_updated_at
  before update on public.produzione_eventi_linea
  for each row execute function public.set_updated_at();

alter table public.produzione_eventi_linea enable row level security;
drop policy if exists produzione_eventi_linea_all on public.produzione_eventi_linea;
create policy produzione_eventi_linea_all
  on public.produzione_eventi_linea for all to authenticated
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
grant select, insert, update on table public.produzione_eventi_linea to authenticated;
grant all on table public.produzione_eventi_linea to postgres, service_role;
revoke delete on table public.produzione_eventi_linea from authenticated;

create table if not exists public.produzione_evento_linea_macchine (
  id uuid primary key default gen_random_uuid(),
  evento_id uuid not null references public.produzione_eventi_linea (id),
  macchinario_id uuid not null references public.produzione_macchinari (id),
  richiesto boolean not null default true,
  confermato_at timestamptz,
  confermato_by uuid references auth.users (id) on delete set null,
  via_iot boolean not null default false,
  created_by uuid references auth.users (id) on delete set null,
  created_at timestamptz not null default now(),
  unique (evento_id, macchinario_id)
);

comment on table public.produzione_evento_linea_macchine is
  'Macchine da spegnere in un evento di linea e conferma Off.';

alter table public.produzione_evento_linea_macchine enable row level security;
drop policy if exists produzione_evento_linea_macchine_all
  on public.produzione_evento_linea_macchine;
create policy produzione_evento_linea_macchine_all
  on public.produzione_evento_linea_macchine for all to authenticated
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
grant select, insert, update on table public.produzione_evento_linea_macchine to authenticated;
grant all on table public.produzione_evento_linea_macchine to postgres, service_role;
revoke delete on table public.produzione_evento_linea_macchine from authenticated;

create table if not exists public.produzione_macchinario_attivita (
  id uuid primary key default gen_random_uuid(),
  macchinario_id uuid not null references public.produzione_macchinari (id),
  area_id uuid not null references public.produzione_aree (id),
  azione text not null check (azione in ('on', 'off')),
  origine text not null
    check (origine in ('panoramica', 'scheda', 'evento_linea', 'iot')),
  evento_linea_id uuid references public.produzione_eventi_linea (id),
  actor_nome text not null default '',
  note text not null default '',
  created_by uuid references auth.users (id) on delete set null,
  created_at timestamptz not null default now()
);

create index if not exists produzione_macchinario_attivita_macchina_idx
  on public.produzione_macchinario_attivita (macchinario_id, created_at desc);

comment on table public.produzione_macchinario_attivita is
  'Registro immutabile On/Off: chi, quando, origine. Solo insert.';

alter table public.produzione_macchinario_attivita enable row level security;
drop policy if exists produzione_macchinario_attivita_select
  on public.produzione_macchinario_attivita;
create policy produzione_macchinario_attivita_select
  on public.produzione_macchinario_attivita for select to authenticated
  using (
    public.has_area_access('produzione')
    or public.has_area_access('amministrazione')
    or public.is_superadmin()
  );
drop policy if exists produzione_macchinario_attivita_insert
  on public.produzione_macchinario_attivita;
create policy produzione_macchinario_attivita_insert
  on public.produzione_macchinario_attivita for insert to authenticated
  with check (
    public.has_area_access('produzione')
    or public.has_area_access('amministrazione')
    or public.is_superadmin()
  );
grant select, insert on table public.produzione_macchinario_attivita to authenticated;
grant all on table public.produzione_macchinario_attivita to postgres, service_role;
revoke update, delete on table public.produzione_macchinario_attivita from authenticated;
