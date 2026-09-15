-- Commerciale: consulta solo il listino in carica (in_uso) e la scontistica.
-- Nessuna scrittura. Admin/superadmin restano gestori completi.
-- ISO 9001 §6.1 / 7.5 / 8.5.2

-- Listini: admin vede tutto; gli altri (anche con area amm) solo in_uso.
drop policy if exists "listini_select_amm" on public.listini;
create policy "listini_select_amm"
  on public.listini for select
  to authenticated
  using (
    deleted_at is null
    and (
      public.is_admin()
      or public.is_superadmin()
      or (
        (
          public.has_area_access('amministrazione')
          or public.has_area_access('commerciale')
        )
        and stato = 'in_uso'
      )
    )
  );

drop policy if exists "listini_insert_amm" on public.listini;
create policy "listini_insert_amm"
  on public.listini for insert to authenticated
  with check (public.is_admin() or public.is_superadmin());

drop policy if exists "listini_update_amm" on public.listini;
create policy "listini_update_amm"
  on public.listini for update to authenticated
  using (public.is_admin() or public.is_superadmin())
  with check (public.is_admin() or public.is_superadmin());

drop policy if exists "listini_righe_select_amm" on public.listini_righe;
create policy "listini_righe_select_amm"
  on public.listini_righe for select
  to authenticated
  using (
    deleted_at is null
    and (
      public.is_admin()
      or public.is_superadmin()
      or exists (
        select 1
        from public.listini l
        where l.id = listino_id
          and l.deleted_at is null
          and l.stato = 'in_uso'
          and (
            public.has_area_access('amministrazione')
            or public.has_area_access('commerciale')
          )
      )
    )
  );

drop policy if exists "listini_righe_insert_amm" on public.listini_righe;
create policy "listini_righe_insert_amm"
  on public.listini_righe for insert to authenticated
  with check (public.is_admin() or public.is_superadmin());

drop policy if exists "listini_righe_update_amm" on public.listini_righe;
create policy "listini_righe_update_amm"
  on public.listini_righe for update to authenticated
  using (public.is_admin() or public.is_superadmin())
  with check (public.is_admin() or public.is_superadmin());

drop policy if exists "listini_righe_condizioni_select_amm"
  on public.listini_righe_condizioni;
create policy "listini_righe_condizioni_select_amm"
  on public.listini_righe_condizioni for select to authenticated
  using (
    public.is_admin()
    or public.is_superadmin()
    or exists (
      select 1
      from public.listini_righe r
      join public.listini l on l.id = r.listino_id
      where r.id = listino_riga_id
        and l.deleted_at is null
        and l.stato = 'in_uso'
        and (
          public.has_area_access('amministrazione')
          or public.has_area_access('commerciale')
        )
    )
  );

drop policy if exists "listini_righe_condizioni_insert_amm"
  on public.listini_righe_condizioni;
create policy "listini_righe_condizioni_insert_amm"
  on public.listini_righe_condizioni for insert to authenticated
  with check (public.is_admin() or public.is_superadmin());

drop policy if exists "listini_righe_condizioni_update_amm"
  on public.listini_righe_condizioni;
create policy "listini_righe_condizioni_update_amm"
  on public.listini_righe_condizioni for update to authenticated
  using (public.is_admin() or public.is_superadmin())
  with check (public.is_admin() or public.is_superadmin());

drop policy if exists listini_nazioni_select_amm on public.listini_nazioni;
create policy listini_nazioni_select_amm
  on public.listini_nazioni for select to authenticated
  using (
    public.is_admin()
    or public.is_superadmin()
    or (
      deleted_at is null
      and exists (
        select 1
        from public.listini l
        where l.id = listino_id
          and l.deleted_at is null
          and l.stato = 'in_uso'
          and (
            public.has_area_access('amministrazione')
            or public.has_area_access('commerciale')
          )
      )
    )
  );

drop policy if exists listini_traduzioni_select_amm on public.listini_traduzioni;
create policy listini_traduzioni_select_amm
  on public.listini_traduzioni for select to authenticated
  using (
    public.is_admin()
    or public.is_superadmin()
    or exists (
      select 1
      from public.listini l
      where l.id = listino_id
        and l.deleted_at is null
        and l.stato = 'in_uso'
        and (
          public.has_area_access('amministrazione')
          or public.has_area_access('commerciale')
        )
    )
  );

-- Pagina Listino visibile a chi ha area Commerciale (alias On/Off invariato).
insert into public.profile_page_access (
  profile_id,
  page_key,
  visibile,
  created_by,
  updated_by
)
select
  p.id,
  '/app/amministrazione/schede/listini-b2b',
  true,
  p.id,
  p.id
from public.profiles p
join public.role_area_permissions rap on rap.role_id = p.role_id
join public.areas a on a.id = rap.area_id
where p.is_active is true
  and a.slug = 'commerciale'
  and rap.can_access is true
  and not exists (
    select 1
    from public.profile_page_access x
    where x.profile_id = p.id
      and x.page_key = '/app/amministrazione/schede/listini-b2b'
      and x.deleted_at is null
  );

update public.profile_page_access x
set
  visibile = true,
  updated_at = now()
where x.deleted_at is null
  and x.page_key = '/app/amministrazione/schede/listini-b2b'
  and x.visibile is not true
  and exists (
    select 1
    from public.profiles p
    join public.role_area_permissions rap on rap.role_id = p.role_id
    join public.areas a on a.id = rap.area_id
    where p.id = x.profile_id
      and p.is_active is true
      and a.slug = 'commerciale'
      and rap.can_access is true
  );
