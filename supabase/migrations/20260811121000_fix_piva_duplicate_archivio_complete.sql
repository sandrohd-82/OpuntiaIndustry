-- Fix: migrazione archivio interrotta da P.IVA duplicate su fornitori
-- Completa indici univoci + RPC se mancanti (idempotente)

-- 1) Dedupe: stessa P.IVA attiva → resta targa più bassa, le altre soft-delete
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
  deleted_at = coalesce(c.deleted_at, now()),
  updated_at = now()
from ranked r
where c.id = r.id and r.rn > 1 and c.deleted_at is null;

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
  deleted_at = coalesce(f.deleted_at, now()),
  updated_at = now()
from ranked r
where f.id = r.id and r.rn > 1 and f.deleted_at is null;

-- 2) Indici univoci P.IVA
create unique index if not exists clienti_partita_iva_active_uidx
  on public.clienti (lower(trim(partita_iva)))
  where deleted_at is null and trim(partita_iva) <> '';

create unique index if not exists fornitori_partita_iva_active_uidx
  on public.fornitori (lower(trim(partita_iva)))
  where deleted_at is null and trim(partita_iva) <> '';

-- 3) RPC archivio (se la migrazione si era fermata prima)
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

-- 4) Verifica tabelle archivio
do $$
begin
  if to_regclass('public.clienti_archivio') is null
     or to_regclass('public.fornitori_archivio') is null then
    raise exception 'Mancano tabelle archivio: riesegui prima 20260811120000_anagrafiche_archivio_opzione_b.sql fino alle create table (senza indici), oppure crea le tabelle.';
  end if;
end $$;
