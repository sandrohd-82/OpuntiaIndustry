-- Capienza e occupazione sul posto logico (ISO 9001).
-- Campi vuoti = nessuna avvertenza. Soft delete/audit già sulla tabella.

alter table public.magazzino_ubicazioni
  add column if not exists peso_max_kg numeric(12, 3),
  add column if not exists misura_unita text not null default 'cm',
  add column if not exists misura_max_larghezza numeric(12, 3),
  add column if not exists misura_max_profondita numeric(12, 3),
  add column if not exists misura_max_altezza numeric(12, 3),
  add column if not exists misura_min_larghezza numeric(12, 3),
  add column if not exists misura_min_profondita numeric(12, 3),
  add column if not exists misura_min_altezza numeric(12, 3),
  add column if not exists occupazione_stato text not null default 'libero',
  add column if not exists occupazione_at timestamptz,
  add column if not exists occupazione_by uuid references auth.users (id) on delete set null;

alter table public.magazzino_ubicazioni
  drop constraint if exists mag_ubic_peso_max_check;
alter table public.magazzino_ubicazioni
  add constraint mag_ubic_peso_max_check
  check (peso_max_kg is null or peso_max_kg > 0);

alter table public.magazzino_ubicazioni
  drop constraint if exists mag_ubic_misura_unita_check;
alter table public.magazzino_ubicazioni
  add constraint mag_ubic_misura_unita_check
  check (misura_unita in ('cm', 'm'));

alter table public.magazzino_ubicazioni
  drop constraint if exists mag_ubic_occupazione_check;
alter table public.magazzino_ubicazioni
  add constraint mag_ubic_occupazione_check
  check (occupazione_stato in ('libero', 'occupato'));

comment on column public.magazzino_ubicazioni.peso_max_kg is
  'Peso massimo applicabile (kg). Vuoto = nessuna avvertenza.';
comment on column public.magazzino_ubicazioni.occupazione_stato is
  'Libero (verde chiaro) o occupato (verde scuro). Chi/quando in occupazione_at/by.';

drop policy if exists "mag_ubic_update" on public.magazzino_ubicazioni;
create policy "mag_ubic_update"
  on public.magazzino_ubicazioni for update
  to authenticated
  using (
    public.is_superadmin()
    or public.has_area_access('amministrazione')
    or public.has_area_access('magazzino')
    or public.has_area_access('strumenti')
  )
  with check (
    public.is_superadmin()
    or public.has_area_access('amministrazione')
    or public.has_area_access('magazzino')
    or public.has_area_access('strumenti')
  );
