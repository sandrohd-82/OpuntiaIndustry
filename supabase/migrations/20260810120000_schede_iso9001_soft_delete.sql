-- Fase 2 ISO 9001: soft delete + updated_by sulle schede anagrafiche
-- clienti, fornitori, materie_prime, prodotti_propri
-- Nessun DELETE fisico via RLS; tracciabilità deleted_at / deleted_by / updated_by

-- ---------------------------------------------------------------------------
-- Helper: aggiunge colonne audit/soft-delete se assenti
-- ---------------------------------------------------------------------------
do $$
declare
  t text;
begin
  foreach t in array array[
    'clienti',
    'fornitori',
    'materie_prime',
    'prodotti_propri'
  ]
  loop
    execute format(
      'alter table public.%I add column if not exists updated_by uuid references auth.users (id) on delete set null',
      t
    );
    execute format(
      'alter table public.%I add column if not exists deleted_at timestamptz',
      t
    );
    execute format(
      'alter table public.%I add column if not exists deleted_by uuid references auth.users (id) on delete set null',
      t
    );
    execute format(
      'comment on column public.%I.deleted_at is %L',
      t,
      'Soft delete ISO 9001: mai cancellazione fisica dei dati operativi'
    );
    execute format(
      'create index if not exists %I on public.%I (deleted_at) where deleted_at is null',
      t || '_active_idx',
      t
    );
  end loop;
end $$;

-- ---------------------------------------------------------------------------
-- CLIENTI: revoca DELETE, solo soft delete
-- ---------------------------------------------------------------------------
revoke delete on table public.clienti from authenticated;

drop policy if exists "clienti_delete_amministrazione" on public.clienti;

-- ---------------------------------------------------------------------------
-- FORNITORI
-- ---------------------------------------------------------------------------
revoke delete on table public.fornitori from authenticated;

drop policy if exists "fornitori_delete_amministrazione" on public.fornitori;

-- ---------------------------------------------------------------------------
-- MATERIE PRIME
-- ---------------------------------------------------------------------------
revoke delete on table public.materie_prime from authenticated;

drop policy if exists "materie_prime_delete_amministrazione" on public.materie_prime;

-- ---------------------------------------------------------------------------
-- PRODOTTI PROPRI
-- ---------------------------------------------------------------------------
revoke delete on table public.prodotti_propri from authenticated;

drop policy if exists "prodotti_propri_delete_amministrazione" on public.prodotti_propri;

-- Assicura che audit_log esista (fase 1). Se assente, crea minimo.
create table if not exists public.audit_log (
  id uuid primary key default gen_random_uuid(),
  entity_type text not null,
  entity_id uuid not null,
  action text not null,
  actor_id uuid references auth.users (id) on delete set null,
  summary text not null default '',
  payload jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);
