-- Editor di aree: più piante/bozze, collegamento a Magazzino > Mappa Magazzino > Nome [Vista].
-- ISO 9001: le bozze non si eliminano; soft delete; audit su chi/quando collega.

drop index if exists public.magazzino_mappe_attiva_uidx;

alter table public.magazzino_mappe
  add column if not exists area_codice text not null default 'magazzino';
alter table public.magazzino_mappe
  add column if not exists luogo_nome text not null default '';
alter table public.magazzino_mappe
  add column if not exists slug text;
alter table public.magazzino_mappe
  add column if not exists collegata_at timestamptz;
alter table public.magazzino_mappe
  add column if not exists collegata_by uuid references auth.users (id) on delete set null;

alter table public.magazzino_mappe
  drop constraint if exists mag_mappe_area_codice_check;
alter table public.magazzino_mappe
  add constraint mag_mappe_area_codice_check
  check (area_codice in ('magazzino'));

create unique index if not exists magazzino_mappe_slug_uidx
  on public.magazzino_mappe (slug)
  where deleted_at is null and slug is not null;

create unique index if not exists magazzino_mappe_collegata_luogo_vista_uidx
  on public.magazzino_mappe (area_codice, lower(luogo_nome), lower(vista_etichetta))
  where deleted_at is null
    and documento_stato = 'approvato'
    and luogo_nome <> '';

comment on column public.magazzino_mappe.luogo_nome is
  'Nome magazzino/luogo in menu (es. Agrinsicilia). Vuoto = solo bozza in editor.';
comment on column public.magazzino_mappe.slug is
  'Percorso pubblico /app/magazzino/mappa/[slug]';

drop policy if exists "magazzino_mappe_select" on public.magazzino_mappe;
create policy "magazzino_mappe_select"
  on public.magazzino_mappe for select
  to authenticated
  using (
    public.is_superadmin()
    or public.has_area_access('magazzino')
    or public.has_area_access('strumenti')
    or public.has_area_access('amministrazione')
  );

drop policy if exists "mag_mappa_linee_select" on public.magazzino_mappa_linee;
create policy "mag_mappa_linee_select"
  on public.magazzino_mappa_linee for select
  to authenticated
  using (
    public.is_superadmin()
    or public.has_area_access('magazzino')
    or public.has_area_access('strumenti')
    or public.has_area_access('amministrazione')
  );

notify pgrst, 'reload schema';
