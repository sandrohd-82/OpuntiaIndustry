-- Catalogo reparti organigramma (distinto dai reparti magazzino).
-- Una persona = un reparto. Soft delete + audit. ISO 9001 8.5.2 / 7.5.

create table if not exists public.organigramma_reparti (
  id uuid primary key default gen_random_uuid(),
  codice text not null,
  nome text not null,
  descrizione text not null default '',
  documento_stato text not null default 'approvato'
    check (documento_stato in ('bozza', 'approvato')),
  versione integer not null default 1,
  created_by uuid references auth.users (id) on delete set null,
  updated_by uuid references auth.users (id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz,
  deleted_by uuid references auth.users (id) on delete set null
);

create unique index if not exists organigramma_reparti_codice_uidx
  on public.organigramma_reparti (lower(codice))
  where deleted_at is null;

drop trigger if exists organigramma_reparti_updated_at on public.organigramma_reparti;
create trigger organigramma_reparti_updated_at
  before update on public.organigramma_reparti
  for each row execute function public.set_updated_at();

alter table public.organigramma_reparti enable row level security;
drop policy if exists organigramma_reparti_select on public.organigramma_reparti;
create policy organigramma_reparti_select
  on public.organigramma_reparti for select to authenticated
  using (
    public.has_area_access('amministrazione')
    or public.has_area_access('produzione')
    or public.is_superadmin()
  );
drop policy if exists organigramma_reparti_write on public.organigramma_reparti;
create policy organigramma_reparti_write
  on public.organigramma_reparti for insert to authenticated
  with check (public.is_admin() or public.is_superadmin());
drop policy if exists organigramma_reparti_update on public.organigramma_reparti;
create policy organigramma_reparti_update
  on public.organigramma_reparti for update to authenticated
  using (public.is_admin() or public.is_superadmin())
  with check (public.is_admin() or public.is_superadmin());

grant select on table public.organigramma_reparti to authenticated;
grant insert, update on table public.organigramma_reparti to authenticated;
grant all on table public.organigramma_reparti to postgres, service_role;
revoke delete on table public.organigramma_reparti from authenticated;

insert into public.organigramma_reparti (codice, nome, descrizione)
select v.codice, v.nome, v.descrizione
from (values
  ('pulizia', 'Pulizia', 'Reparto pulizia'),
  ('uffici', 'Uffici', 'Uffici amministrativi e direzionali'),
  ('prima-lavorazione', 'Prima lavorazione', 'Prima lavorazione produttiva'),
  ('essiccazione', 'Essiccazione', 'Reparto essiccazione'),
  ('seconda-lavorazione', 'Seconda lavorazione', 'Seconda lavorazione produttiva'),
  ('imballaggi-spedizioni', 'Imballaggi e spedizioni', 'Imballaggio e spedizione'),
  ('movimentazione', 'Movimentazione', 'Movimentazione interna')
) as v(codice, nome, descrizione)
where not exists (
  select 1 from public.organigramma_reparti r
  where lower(r.codice) = v.codice and r.deleted_at is null
);

alter table public.organigramma_persone
  add column if not exists reparto_id uuid
  references public.organigramma_reparti (id) on delete set null;

create index if not exists organigramma_persone_reparto_idx
  on public.organigramma_persone (reparto_id)
  where deleted_at is null;

comment on column public.organigramma_persone.reparto_id is
  'Reparto organizzativo della persona (catalogo organigramma_reparti).';
