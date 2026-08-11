-- ONE-SHOT completo (eseguire QUESTO file in SQL Editor se la migrazione precedente è fallita)
-- Crea tabelle archivio + pulizia test + dedupe P.IVA + indici + RPC
-- Idempotente: si può rieseguire senza danni
--
-- Opzione B: archivi separati clienti/fornitori (senza targa) + pulizia test
-- Schede mai usate eliminate → move in archivio (libera targa)
-- Schede con attività → soft delete (targa resta occupata)
-- Pulizia: elimina fisicamente tutto tranne C001–C003 e F001–F002

-- ---------------------------------------------------------------------------
-- clienti_archivio
-- ---------------------------------------------------------------------------
create table if not exists public.clienti_archivio (
  id uuid primary key default gen_random_uuid(),
  partita_iva text not null default '',
  ragione_sociale text not null default '',
  fic_entity_id bigint,
  motivo text not null default 'eliminata',
  note text not null default '',
  snapshot jsonb not null default '{}'::jsonb,
  created_by uuid references auth.users (id) on delete set null,
  updated_by uuid references auth.users (id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  ripescato_at timestamptz,
  ripescato_by uuid references auth.users (id) on delete set null,
  constraint clienti_archivio_motivo_check check (
    motivo in ('eliminata', 'scartata_sync', 'pulizia')
  )
);

comment on table public.clienti_archivio is
  'Clienti scartati/eliminati senza attività — senza targa; ripescaggio su P.IVA (ISO 8.5.2)';

create index if not exists clienti_archivio_vat_idx
  on public.clienti_archivio (lower(trim(partita_iva)))
  where ripescato_at is null and trim(partita_iva) <> '';

create index if not exists clienti_archivio_fic_idx
  on public.clienti_archivio (fic_entity_id)
  where ripescato_at is null and fic_entity_id is not null;

drop trigger if exists clienti_archivio_updated_at on public.clienti_archivio;
create trigger clienti_archivio_updated_at
  before update on public.clienti_archivio
  for each row execute function public.set_updated_at();

alter table public.clienti_archivio enable row level security;

drop policy if exists "clienti_archivio_select_amm" on public.clienti_archivio;
create policy "clienti_archivio_select_amm"
  on public.clienti_archivio for select to authenticated
  using (public.has_area_access('amministrazione') or public.is_superadmin());

drop policy if exists "clienti_archivio_insert_amm" on public.clienti_archivio;
create policy "clienti_archivio_insert_amm"
  on public.clienti_archivio for insert to authenticated
  with check (public.has_area_access('amministrazione') or public.is_superadmin());

drop policy if exists "clienti_archivio_update_amm" on public.clienti_archivio;
create policy "clienti_archivio_update_amm"
  on public.clienti_archivio for update to authenticated
  using (public.has_area_access('amministrazione') or public.is_superadmin())
  with check (public.has_area_access('amministrazione') or public.is_superadmin());

grant select, insert, update on table public.clienti_archivio to authenticated;
grant all on table public.clienti_archivio to postgres, service_role;

-- ---------------------------------------------------------------------------
-- fornitori_archivio
-- ---------------------------------------------------------------------------
create table if not exists public.fornitori_archivio (
  id uuid primary key default gen_random_uuid(),
  partita_iva text not null default '',
  ragione_sociale text not null default '',
  fic_entity_id bigint,
  motivo text not null default 'eliminata',
  note text not null default '',
  snapshot jsonb not null default '{}'::jsonb,
  created_by uuid references auth.users (id) on delete set null,
  updated_by uuid references auth.users (id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  ripescato_at timestamptz,
  ripescato_by uuid references auth.users (id) on delete set null,
  constraint fornitori_archivio_motivo_check check (
    motivo in ('eliminata', 'scartata_sync', 'pulizia')
  )
);

comment on table public.fornitori_archivio is
  'Fornitori scartati/eliminati senza attività — senza targa; ripescaggio su P.IVA (ISO 8.5.2)';

create index if not exists fornitori_archivio_vat_idx
  on public.fornitori_archivio (lower(trim(partita_iva)))
  where ripescato_at is null and trim(partita_iva) <> '';

create index if not exists fornitori_archivio_fic_idx
  on public.fornitori_archivio (fic_entity_id)
  where ripescato_at is null and fic_entity_id is not null;

drop trigger if exists fornitori_archivio_updated_at on public.fornitori_archivio;
create trigger fornitori_archivio_updated_at
  before update on public.fornitori_archivio
  for each row execute function public.set_updated_at();

alter table public.fornitori_archivio enable row level security;

drop policy if exists "fornitori_archivio_select_amm" on public.fornitori_archivio;
create policy "fornitori_archivio_select_amm"
  on public.fornitori_archivio for select to authenticated
  using (public.has_area_access('amministrazione') or public.is_superadmin());

drop policy if exists "fornitori_archivio_insert_amm" on public.fornitori_archivio;
create policy "fornitori_archivio_insert_amm"
  on public.fornitori_archivio for insert to authenticated
  with check (public.has_area_access('amministrazione') or public.is_superadmin());

drop policy if exists "fornitori_archivio_update_amm" on public.fornitori_archivio;
create policy "fornitori_archivio_update_amm"
  on public.fornitori_archivio for update to authenticated
  using (public.has_area_access('amministrazione') or public.is_superadmin())
  with check (public.has_area_access('amministrazione') or public.is_superadmin());

grant select, insert, update on table public.fornitori_archivio to authenticated;
grant all on table public.fornitori_archivio to postgres, service_role;

-- ---------------------------------------------------------------------------
-- Scarti FiC: consentito DELETE per ripescaggio (rimuove lo skip)
-- ---------------------------------------------------------------------------
grant delete on table public.fic_import_discarded to authenticated;

drop policy if exists "fic_import_discarded_delete_amm" on public.fic_import_discarded;
create policy "fic_import_discarded_delete_amm"
  on public.fic_import_discarded for delete to authenticated
  using (public.has_area_access('amministrazione') or public.is_superadmin());

-- ---------------------------------------------------------------------------
-- PULIZIA TEST prima degli indici univoci: solo C001–C003 e F001–F002
-- (dati di prova — eliminazione fisica completa, non archivio)
-- ---------------------------------------------------------------------------
update public.ordini
set cliente_id = null
where cliente_id is not null
  and cliente_id in (
    select id from public.clienti
    where upper(codice_targa) not in ('C001', 'C002', 'C003')
  );

update public.materie_prime
set fornitore_bio_id = null
where fornitore_bio_id is not null
  and fornitore_bio_id in (
    select id from public.fornitori
    where upper(codice_targa) not in ('F001', 'F002')
  );

delete from public.clienti
where upper(codice_targa) not in ('C001', 'C002', 'C003');

delete from public.fornitori
where upper(codice_targa) not in ('F001', 'F002');

delete from public.fic_import_discarded;

update public.fic_import_checkpoints
set
  status = 'idle',
  completed_fic_ids = '{}'::bigint[],
  last_saved_fic_entity_id = null,
  last_saved_name = '',
  last_saved_vat = '';

-- ---------------------------------------------------------------------------
-- Dedupe P.IVA attive (tiene la targa più bassa, soft-delete le altre)
-- ---------------------------------------------------------------------------
with ranked as (
  select
    id,
    row_number() over (
      partition by lower(trim(partita_iva))
      order by codice_targa asc, created_at asc
    ) as rn
  from public.clienti
  where deleted_at is null and trim(partita_iva) <> ''
)
update public.clienti c
set
  deleted_at = now(),
  updated_at = now()
from ranked r
where c.id = r.id and r.rn > 1;

with ranked as (
  select
    id,
    row_number() over (
      partition by lower(trim(partita_iva))
      order by codice_targa asc, created_at asc
    ) as rn
  from public.fornitori
  where deleted_at is null and trim(partita_iva) <> ''
)
update public.fornitori f
set
  deleted_at = now(),
  updated_at = now()
from ranked r
where f.id = r.id and r.rn > 1;

-- ---------------------------------------------------------------------------
-- Univocità P.IVA sulle schede attive
-- ---------------------------------------------------------------------------
create unique index if not exists clienti_partita_iva_active_uidx
  on public.clienti (lower(trim(partita_iva)))
  where deleted_at is null and trim(partita_iva) <> '';

create unique index if not exists fornitori_partita_iva_active_uidx
  on public.fornitori (lower(trim(partita_iva)))
  where deleted_at is null and trim(partita_iva) <> '';

-- ---------------------------------------------------------------------------
-- RPC: archivia cliente inutilizzato (libera targa via DELETE fisico)
-- ---------------------------------------------------------------------------
create or replace function public.archive_unused_cliente(
  p_id uuid,
  p_motivo text,
  p_note text default '',
  p_actor uuid default auth.uid()
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  r public.clienti%rowtype;
  snap jsonb;
  arch_id uuid;
  has_ordini boolean;
begin
  if not (public.has_area_access('amministrazione') or public.is_superadmin()) then
    raise exception 'ACCESS_DENIED';
  end if;

  if p_motivo is null or p_motivo not in ('eliminata', 'scartata_sync', 'pulizia') then
    raise exception 'INVALID_MOTIVO';
  end if;

  select * into r from public.clienti where id = p_id and deleted_at is null;
  if not found then
    raise exception 'NOT_FOUND';
  end if;

  select exists (
    select 1 from public.ordini o
    where o.cliente_id = p_id and o.deleted_at is null
  ) into has_ordini;

  if has_ordini then
    raise exception 'HAS_ACTIVITY';
  end if;

  snap := to_jsonb(r) - 'codice_targa' - 'id' - 'deleted_at' - 'deleted_by'
    - 'created_at' - 'updated_at' - 'created_by' - 'updated_by';

  insert into public.clienti_archivio (
    partita_iva, ragione_sociale, motivo, note, snapshot,
    created_by, updated_by
  ) values (
    coalesce(r.partita_iva, ''),
    coalesce(r.ragione_sociale, ''),
    p_motivo,
    coalesce(p_note, ''),
    snap,
    p_actor,
    p_actor
  )
  returning id into arch_id;

  delete from public.clienti where id = p_id;

  return jsonb_build_object(
    'archivio_id', arch_id,
    'former_codice_targa', r.codice_targa,
    'partita_iva', r.partita_iva,
    'ragione_sociale', r.ragione_sociale
  );
end;
$$;

revoke all on function public.archive_unused_cliente(uuid, text, text, uuid) from public;
grant execute on function public.archive_unused_cliente(uuid, text, text, uuid) to authenticated;

-- ---------------------------------------------------------------------------
-- RPC: archivia fornitore inutilizzato
-- ---------------------------------------------------------------------------
create or replace function public.archive_unused_fornitore(
  p_id uuid,
  p_motivo text,
  p_note text default '',
  p_actor uuid default auth.uid()
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  r public.fornitori%rowtype;
  snap jsonb;
  arch_id uuid;
  has_bio boolean;
begin
  if not (public.has_area_access('amministrazione') or public.is_superadmin()) then
    raise exception 'ACCESS_DENIED';
  end if;

  if p_motivo is null or p_motivo not in ('eliminata', 'scartata_sync', 'pulizia') then
    raise exception 'INVALID_MOTIVO';
  end if;

  select * into r from public.fornitori where id = p_id and deleted_at is null;
  if not found then
    raise exception 'NOT_FOUND';
  end if;

  select exists (
    select 1 from public.materie_prime m
    where m.fornitore_bio_id = p_id and m.deleted_at is null
  ) into has_bio;

  if has_bio then
    raise exception 'HAS_ACTIVITY';
  end if;

  snap := to_jsonb(r) - 'codice_targa' - 'id' - 'deleted_at' - 'deleted_by'
    - 'created_at' - 'updated_at' - 'created_by' - 'updated_by';

  insert into public.fornitori_archivio (
    partita_iva, ragione_sociale, motivo, note, snapshot,
    created_by, updated_by
  ) values (
    coalesce(r.partita_iva, ''),
    coalesce(r.ragione_sociale, ''),
    p_motivo,
    coalesce(p_note, ''),
    snap,
    p_actor,
    p_actor
  )
  returning id into arch_id;

  delete from public.fornitori where id = p_id;

  return jsonb_build_object(
    'archivio_id', arch_id,
    'former_codice_targa', r.codice_targa,
    'partita_iva', r.partita_iva,
    'ragione_sociale', r.ragione_sociale
  );
end;
$$;

revoke all on function public.archive_unused_fornitore(uuid, text, text, uuid) from public;
grant execute on function public.archive_unused_fornitore(uuid, text, text, uuid) to authenticated;
