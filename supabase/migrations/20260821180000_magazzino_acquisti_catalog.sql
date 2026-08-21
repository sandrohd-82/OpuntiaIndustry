-- Magazzino Opzione A: giacenze su prodotti acquistati (materia prima + Pr fornitore),
-- non più su prodotti_propri (Agrindicilia).

-- Soft-delete giacenze/note legate ai prodotti propri (non più in magazzino)
update public.magazzino_note_acquisto_righe
set
  deleted_at = coalesce(deleted_at, now()),
  deleted_by = coalesce(deleted_by, updated_by)
where deleted_at is null;

update public.magazzino_giacenze
set
  deleted_at = coalesce(deleted_at, now()),
  deleted_by = coalesce(deleted_by, updated_by)
where deleted_at is null;

-- ---------------------------------------------------------------------------
-- magazzino_giacenze: catalog_kind + drop FK prodotti_propri
-- ---------------------------------------------------------------------------
alter table public.magazzino_giacenze
  add column if not exists catalog_kind text;

update public.magazzino_giacenze
set catalog_kind = 'legacy_propri'
where catalog_kind is null;

alter table public.magazzino_giacenze
  alter column catalog_kind set default 'materia_prima';

alter table public.magazzino_giacenze
  drop constraint if exists magazzino_giacenze_catalog_kind_check;
alter table public.magazzino_giacenze
  add constraint magazzino_giacenze_catalog_kind_check
  check (catalog_kind in ('materia_prima', 'prodotto_fornitore', 'legacy_propri'));

-- Drop FK to prodotti_propri (prodotto_id becomes generico UUID articolo)
do $$
declare
  cname text;
begin
  select conname into cname
  from pg_constraint
  where conrelid = 'public.magazzino_giacenze'::regclass
    and contype = 'f'
    and pg_get_constraintdef(oid) ilike '%prodotti_propri%';
  if cname is not null then
    execute format('alter table public.magazzino_giacenze drop constraint %I', cname);
  end if;
end $$;

drop index if exists public.magazzino_giacenze_prodotto_uidx;
create unique index if not exists magazzino_giacenze_kind_articolo_uidx
  on public.magazzino_giacenze (catalog_kind, prodotto_id)
  where deleted_at is null;

comment on table public.magazzino_giacenze is
  'Giacenza corrente per articoli acquistati: materia_prima (Mp) o prodotto_fornitore (Pr).';
comment on column public.magazzino_giacenze.catalog_kind is
  'materia_prima | prodotto_fornitore (legacy_propri solo storico soft-deleted)';
comment on column public.magazzino_giacenze.prodotto_id is
  'UUID articolo in materie_prime oppure catalogo_prodotti_fornitore';

-- ---------------------------------------------------------------------------
-- note acquisto righe: stesso modello
-- ---------------------------------------------------------------------------
alter table public.magazzino_note_acquisto_righe
  add column if not exists catalog_kind text;

update public.magazzino_note_acquisto_righe
set catalog_kind = 'legacy_propri'
where catalog_kind is null;

alter table public.magazzino_note_acquisto_righe
  alter column catalog_kind set default 'materia_prima';

alter table public.magazzino_note_acquisto_righe
  drop constraint if exists magazzino_note_acquisto_righe_catalog_kind_check;
alter table public.magazzino_note_acquisto_righe
  add constraint magazzino_note_acquisto_righe_catalog_kind_check
  check (catalog_kind in ('materia_prima', 'prodotto_fornitore', 'legacy_propri'));

do $$
declare
  cname text;
begin
  select conname into cname
  from pg_constraint
  where conrelid = 'public.magazzino_note_acquisto_righe'::regclass
    and contype = 'f'
    and pg_get_constraintdef(oid) ilike '%prodotti_propri%';
  if cname is not null then
    execute format(
      'alter table public.magazzino_note_acquisto_righe drop constraint %I',
      cname
    );
  end if;
end $$;

drop index if exists public.magazzino_note_acquisto_righe_open_prodotto_uidx;
create unique index if not exists magazzino_note_acquisto_righe_open_kind_uidx
  on public.magazzino_note_acquisto_righe (nota_id, catalog_kind, prodotto_id)
  where deleted_at is null;

comment on column public.magazzino_note_acquisto_righe.catalog_kind is
  'Stesso catalog_kind della giacenza (materia_prima | prodotto_fornitore)';

-- ---------------------------------------------------------------------------
-- RLS lettura cataloghi da area magazzino
-- ---------------------------------------------------------------------------
drop policy if exists "materie_prime_select_magazzino" on public.materie_prime;
create policy "materie_prime_select_magazzino"
  on public.materie_prime for select to authenticated
  using (
    public.has_area_access('magazzino')
    or public.has_area_access('amministrazione')
    or public.is_superadmin()
  );

drop policy if exists "catalogo_prodotti_fornitore_select_magazzino"
  on public.catalogo_prodotti_fornitore;
create policy "catalogo_prodotti_fornitore_select_magazzino"
  on public.catalogo_prodotti_fornitore for select to authenticated
  using (
    public.has_area_access('magazzino')
    or public.has_area_access('amministrazione')
    or public.is_superadmin()
  );

-- Replace old select-only amm policy name collision: keep insert/update amm-only;
-- select already covered by new policy OR old — drop old select if duplicate OR keep both (OR is fine).
