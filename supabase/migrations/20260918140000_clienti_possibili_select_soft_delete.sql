-- ISO 9001 8.5.2 / 10.2: il soft-delete deve restare tracciabile.
-- SELECT con "deleted_at is null" faceva fallire l'UPDATE (RETURNING invisibile):
-- "new row violates row-level security policy for table clienti_possibili".
-- L'elenco in app continua a filtrare deleted_at is null.

drop policy if exists "clienti_possibili_select" on public.clienti_possibili;
create policy "clienti_possibili_select" on public.clienti_possibili
  for select to authenticated
  using (
    public.is_superadmin()
    or public.has_area_access('amministrazione')
    or public.has_area_access('commerciale')
  );
