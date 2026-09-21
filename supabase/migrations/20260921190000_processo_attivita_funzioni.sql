-- ISO 9001: collegamento attività di processo ↔ funzioni/percorsi del gestionale.
-- Soft delete, audit, nessuna cancellazione fisica.

create table if not exists public.produzione_processo_attivita_funzioni (
  id uuid primary key default gen_random_uuid(),
  attivita_id uuid not null
    references public.produzione_processo_attivita (id) on delete restrict,
  funzione_key text not null,
  percorso text not null,
  area_label text not null default '',
  etichetta text not null,
  spiegazione text not null default '',
  tipo text not null default 'pagina'
    check (tipo in ('pagina', 'azione', 'inline')),
  avvio text not null default 'navigate'
    check (avvio in ('navigate', 'inline_pesata')),
  sort_order integer not null default 0,
  versione integer not null default 1,
  documento_stato text not null default 'registrato'
    check (documento_stato in ('bozza', 'registrato', 'chiuso')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  created_by uuid references auth.users (id) on delete set null,
  updated_by uuid references auth.users (id) on delete set null,
  deleted_at timestamptz,
  deleted_by uuid references auth.users (id) on delete set null
);

create unique index if not exists produzione_processo_attivita_funzioni_open_uidx
  on public.produzione_processo_attivita_funzioni (attivita_id, funzione_key)
  where deleted_at is null;

create index if not exists produzione_processo_attivita_funzioni_attivita_idx
  on public.produzione_processo_attivita_funzioni (attivita_id)
  where deleted_at is null;

comment on table public.produzione_processo_attivita_funzioni is
  'Funzioni del gestionale collegate a un''attività di processo (percorso interno, audit ISO 9001).';

drop trigger if exists produzione_processo_attivita_funzioni_updated_at
  on public.produzione_processo_attivita_funzioni;
create trigger produzione_processo_attivita_funzioni_updated_at
  before update on public.produzione_processo_attivita_funzioni
  for each row execute function public.set_updated_at();

alter table public.produzione_processo_attivita_funzioni enable row level security;

drop policy if exists produzione_processo_attivita_funzioni_all
  on public.produzione_processo_attivita_funzioni;
create policy produzione_processo_attivita_funzioni_all
  on public.produzione_processo_attivita_funzioni for all to authenticated
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

grant select, insert, update on table public.produzione_processo_attivita_funzioni
  to authenticated;
grant all on table public.produzione_processo_attivita_funzioni
  to postgres, service_role;
revoke delete on table public.produzione_processo_attivita_funzioni
  from authenticated;
