-- Collegamento utente ↔ anagrafica fornitore (Materiale in ingresso).
-- Un utente attivo ha al massimo un fornitore. Un fornitore può avere più utenti.
-- Nessuna cancellazione fisica: revoca con deleted_at.
-- Il fornitore legge solo la propria riga e non può modificarla.

create table if not exists public.fornitori_accessi (
  id uuid primary key default gen_random_uuid(),
  profile_id uuid not null references public.profiles (id) on delete cascade,
  fornitore_id uuid not null references public.fornitori (id) on delete restrict,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  created_by uuid references public.profiles (id) on delete set null,
  updated_by uuid references public.profiles (id) on delete set null,
  deleted_at timestamptz,
  deleted_by uuid references public.profiles (id) on delete set null
);

comment on table public.fornitori_accessi is
  'Identità fornitore del login. Un profilo attivo è collegato a una sola anagrafica.';

create unique index if not exists fornitori_accessi_profile_attivo_uidx
  on public.fornitori_accessi (profile_id)
  where deleted_at is null;

create index if not exists fornitori_accessi_fornitore_attivo_idx
  on public.fornitori_accessi (fornitore_id)
  where deleted_at is null;

drop trigger if exists fornitori_accessi_updated_at on public.fornitori_accessi;
create trigger fornitori_accessi_updated_at
  before update on public.fornitori_accessi
  for each row execute function public.set_updated_at();

create or replace function public.fornitore_collegato_id()
returns uuid
language sql
stable
security definer
set search_path = public
as $$
  select a.fornitore_id
  from public.fornitori_accessi a
  where a.profile_id = public.app_effective_uid()
    and a.deleted_at is null
  limit 1;
$$;

comment on function public.fornitore_collegato_id() is
  'Anagrafica fornitore del login effettivo. Null se non collegato.';

revoke all on function public.fornitore_collegato_id() from public, anon;
grant execute on function public.fornitore_collegato_id() to authenticated;

alter table public.fornitori_accessi enable row level security;

drop policy if exists "fornitori_accessi_select" on public.fornitori_accessi;
create policy "fornitori_accessi_select"
  on public.fornitori_accessi for select
  to authenticated
  using (
    (
      profile_id = public.app_effective_uid()
      and deleted_at is null
    )
    or public.is_superadmin()
    or public.has_area_access('amministrazione')
    or public.has_area_access('produzione')
  );

drop policy if exists "fornitori_accessi_insert" on public.fornitori_accessi;
create policy "fornitori_accessi_insert"
  on public.fornitori_accessi for insert
  to authenticated
  with check (
    public.is_superadmin()
    or public.has_area_access('amministrazione')
  );

drop policy if exists "fornitori_accessi_update" on public.fornitori_accessi;
create policy "fornitori_accessi_update"
  on public.fornitori_accessi for update
  to authenticated
  using (
    public.is_superadmin()
    or public.has_area_access('amministrazione')
  )
  with check (
    public.is_superadmin()
    or public.has_area_access('amministrazione')
  );

grant select, insert, update on table public.fornitori_accessi to authenticated;
revoke delete on table public.fornitori_accessi from authenticated, anon;
revoke all on table public.fornitori_accessi from anon;

-- Il fornitore legge solo la propria anagrafica. Non può aggiornarla.
drop policy if exists "fornitori_select_accesso_collegato" on public.fornitori;
create policy "fornitori_select_accesso_collegato"
  on public.fornitori for select
  to authenticated
  using (
    deleted_at is null
    and id = public.fornitore_collegato_id()
  );
