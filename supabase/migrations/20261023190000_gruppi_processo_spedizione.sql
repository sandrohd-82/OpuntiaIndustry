-- Raggruppamento in scaletta: processo condiviso e spedizione con scatole.
-- ISO 9001 §7.5 / §8.5.2: stato, versione, audit, soft delete. I documenti restano distinti.

create table if not exists public.produzione_gruppi_processo (
  id uuid primary key default gen_random_uuid(),
  numero text not null,
  stato text not null default 'bozza',
  documento_stato text not null default 'bozza',
  versione integer not null default 1,
  note text not null default '',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  created_by uuid references auth.users (id) on delete set null,
  updated_by uuid references auth.users (id) on delete set null,
  deleted_at timestamptz,
  deleted_by uuid references auth.users (id) on delete set null,
  constraint produzione_gruppi_processo_stato_check check (
    stato in ('bozza', 'in_scaletta', 'chiuso')
  ),
  constraint produzione_gruppi_processo_doc_check check (
    documento_stato in ('bozza', 'approvato', 'chiuso')
  )
);

comment on table public.produzione_gruppi_processo is
  'Processo di produzione condiviso da più ordini o campionature. Ogni documento resta identificabile.';

create unique index if not exists produzione_gruppi_processo_numero_uidx
  on public.produzione_gruppi_processo (numero)
  where deleted_at is null;

drop trigger if exists produzione_gruppi_processo_updated_at on public.produzione_gruppi_processo;
create trigger produzione_gruppi_processo_updated_at
  before update on public.produzione_gruppi_processo
  for each row execute function public.set_updated_at();

create table if not exists public.produzione_gruppi_processo_membri (
  id uuid primary key default gen_random_uuid(),
  gruppo_id uuid not null references public.produzione_gruppi_processo (id),
  entity_type text not null,
  entity_id uuid not null,
  in_scaletta boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  created_by uuid references auth.users (id) on delete set null,
  updated_by uuid references auth.users (id) on delete set null,
  deleted_at timestamptz,
  deleted_by uuid references auth.users (id) on delete set null,
  constraint produzione_gruppi_processo_membri_type_check check (
    entity_type in ('ordine', 'campionatura')
  )
);

comment on table public.produzione_gruppi_processo_membri is
  'Documenti uniti nello stesso processo. in_scaletta indica se il documento è già entrato in scaletta.';

create index if not exists produzione_gruppi_processo_membri_entity_idx
  on public.produzione_gruppi_processo_membri (entity_type, entity_id)
  where deleted_at is null;

drop trigger if exists produzione_gruppi_processo_membri_updated_at on public.produzione_gruppi_processo_membri;
create trigger produzione_gruppi_processo_membri_updated_at
  before update on public.produzione_gruppi_processo_membri
  for each row execute function public.set_updated_at();

create table if not exists public.spedizioni_gruppi (
  id uuid primary key default gen_random_uuid(),
  numero text not null,
  stato text not null default 'bozza',
  documento_stato text not null default 'bozza',
  versione integer not null default 1,
  destinatario text not null default '',
  indirizzo text not null default '',
  tracking_url text not null default '',
  mail_inviata_at timestamptz,
  note text not null default '',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  created_by uuid references auth.users (id) on delete set null,
  updated_by uuid references auth.users (id) on delete set null,
  deleted_at timestamptz,
  deleted_by uuid references auth.users (id) on delete set null,
  constraint spedizioni_gruppi_stato_check check (
    stato in ('bozza', 'pronta', 'spedita', 'chiusa')
  ),
  constraint spedizioni_gruppi_doc_check check (
    documento_stato in ('bozza', 'approvato', 'chiuso')
  )
);

comment on table public.spedizioni_gruppi is
  'Spedizione unica per più documenti. Indipendente dal processo. Una mail di tracking per il gruppo.';

create unique index if not exists spedizioni_gruppi_numero_uidx
  on public.spedizioni_gruppi (numero)
  where deleted_at is null;

drop trigger if exists spedizioni_gruppi_updated_at on public.spedizioni_gruppi;
create trigger spedizioni_gruppi_updated_at
  before update on public.spedizioni_gruppi
  for each row execute function public.set_updated_at();

create table if not exists public.spedizioni_gruppi_colli (
  id uuid primary key default gen_random_uuid(),
  gruppo_id uuid not null references public.spedizioni_gruppi (id),
  etichetta text not null,
  sort_order integer not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  created_by uuid references auth.users (id) on delete set null,
  updated_by uuid references auth.users (id) on delete set null,
  deleted_at timestamptz,
  deleted_by uuid references auth.users (id) on delete set null
);

comment on table public.spedizioni_gruppi_colli is
  'Scatole di una spedizione di gruppo. Una spedizione può avere una o più scatole.';

drop trigger if exists spedizioni_gruppi_colli_updated_at on public.spedizioni_gruppi_colli;
create trigger spedizioni_gruppi_colli_updated_at
  before update on public.spedizioni_gruppi_colli
  for each row execute function public.set_updated_at();

create table if not exists public.spedizioni_gruppi_contenuti (
  id uuid primary key default gen_random_uuid(),
  gruppo_id uuid not null references public.spedizioni_gruppi (id),
  collo_id uuid not null references public.spedizioni_gruppi_colli (id),
  entity_type text not null,
  entity_id uuid not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  created_by uuid references auth.users (id) on delete set null,
  updated_by uuid references auth.users (id) on delete set null,
  deleted_at timestamptz,
  deleted_by uuid references auth.users (id) on delete set null,
  constraint spedizioni_gruppi_contenuti_type_check check (
    entity_type in ('ordine', 'campionatura')
  )
);

comment on table public.spedizioni_gruppi_contenuti is
  'Documenti assegnati a una scatola. Ogni documento sta in una sola scatola della spedizione.';

create index if not exists spedizioni_gruppi_contenuti_entity_idx
  on public.spedizioni_gruppi_contenuti (entity_type, entity_id)
  where deleted_at is null;

drop trigger if exists spedizioni_gruppi_contenuti_updated_at on public.spedizioni_gruppi_contenuti;
create trigger spedizioni_gruppi_contenuti_updated_at
  before update on public.spedizioni_gruppi_contenuti
  for each row execute function public.set_updated_at();

alter table public.produzione_gruppi_processo enable row level security;
alter table public.produzione_gruppi_processo_membri enable row level security;
alter table public.spedizioni_gruppi enable row level security;
alter table public.spedizioni_gruppi_colli enable row level security;
alter table public.spedizioni_gruppi_contenuti enable row level security;

do $$
declare
  t text;
begin
  foreach t in array array[
    'produzione_gruppi_processo',
    'produzione_gruppi_processo_membri',
    'spedizioni_gruppi',
    'spedizioni_gruppi_colli',
    'spedizioni_gruppi_contenuti'
  ]
  loop
    execute format('drop policy if exists %I on public.%I', t || '_select', t);
    execute format('drop policy if exists %I on public.%I', t || '_write', t);
    execute format('drop policy if exists %I on public.%I', t || '_insert', t);
    execute format('drop policy if exists %I on public.%I', t || '_update', t);
    execute format(
      'create policy %I on public.%I for select to authenticated using (
        public.has_area_access(''amministrazione'')
        or public.has_area_access(''produzione'')
        or public.has_area_access(''commerciale'')
        or public.is_superadmin()
      )',
      t || '_select',
      t
    );
    execute format(
      'create policy %I on public.%I for insert to authenticated with check (
        public.has_area_access(''amministrazione'')
        or public.has_area_access(''produzione'')
        or public.is_superadmin()
      )',
      t || '_insert',
      t
    );
    execute format(
      'create policy %I on public.%I for update to authenticated using (
        public.has_area_access(''amministrazione'')
        or public.has_area_access(''produzione'')
        or public.is_superadmin()
      ) with check (
        public.has_area_access(''amministrazione'')
        or public.has_area_access(''produzione'')
        or public.is_superadmin()
      )',
      t || '_update',
      t
    );
    execute format('grant select, insert, update on public.%I to authenticated', t);
    execute format('grant all on public.%I to postgres, service_role', t);
    execute format('revoke delete on public.%I from authenticated', t);
  end loop;
end $$;
