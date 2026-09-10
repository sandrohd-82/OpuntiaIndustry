-- ISO 9001: commerciale legge/scrive possibili clienti e può promuovere
-- il lead a cliente quando crea un ordine (stesso perimetro di createCliente).

drop policy if exists "clienti_possibili_select" on public.clienti_possibili;
create policy "clienti_possibili_select" on public.clienti_possibili
  for select to authenticated
  using (
    deleted_at is null
    and (
      public.is_superadmin()
      or public.has_area_access('amministrazione')
      or public.has_area_access('commerciale')
    )
  );

drop policy if exists "clienti_possibili_insert" on public.clienti_possibili;
create policy "clienti_possibili_insert" on public.clienti_possibili
  for insert to authenticated
  with check (
    public.is_superadmin()
    or public.has_area_access('amministrazione')
    or public.has_area_access('commerciale')
  );

drop policy if exists "clienti_possibili_update" on public.clienti_possibili;
create policy "clienti_possibili_update" on public.clienti_possibili
  for update to authenticated
  using (
    public.is_superadmin()
    or public.has_area_access('amministrazione')
    or public.has_area_access('commerciale')
  )
  with check (
    public.is_superadmin()
    or public.has_area_access('amministrazione')
    or public.has_area_access('commerciale')
  );

drop policy if exists "clienti_possibili_referenti_select" on public.clienti_possibili_referenti;
create policy "clienti_possibili_referenti_select"
  on public.clienti_possibili_referenti
  for select to authenticated
  using (
    public.is_superadmin()
    or public.has_area_access('amministrazione')
    or public.has_area_access('commerciale')
  );

drop policy if exists "clienti_possibili_referenti_insert" on public.clienti_possibili_referenti;
create policy "clienti_possibili_referenti_insert"
  on public.clienti_possibili_referenti
  for insert to authenticated
  with check (
    public.is_superadmin()
    or public.has_area_access('amministrazione')
    or public.has_area_access('commerciale')
  );

drop policy if exists "clienti_possibili_referenti_update" on public.clienti_possibili_referenti;
create policy "clienti_possibili_referenti_update"
  on public.clienti_possibili_referenti
  for update to authenticated
  using (
    public.is_superadmin()
    or public.has_area_access('amministrazione')
    or public.has_area_access('commerciale')
  )
  with check (
    public.is_superadmin()
    or public.has_area_access('amministrazione')
    or public.has_area_access('commerciale')
  );

drop policy if exists "clienti_possibili_referenti_delete" on public.clienti_possibili_referenti;
create policy "clienti_possibili_referenti_delete"
  on public.clienti_possibili_referenti
  for delete to authenticated
  using (
    public.is_superadmin()
    or public.has_area_access('amministrazione')
    or public.has_area_access('commerciale')
  );

drop policy if exists "clienti_insert_amministrazione" on public.clienti;
create policy "clienti_insert_amministrazione"
  on public.clienti for insert
  to authenticated
  with check (
    public.is_superadmin()
    or public.has_area_access('amministrazione')
    or public.has_area_access('commerciale')
  );
