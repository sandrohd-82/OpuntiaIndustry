-- Area Fiscale: area di primo livello (sotto HR, sopra Impostazioni)
-- Opzione A — senza ruolo commercialista (fase successiva)

insert into public.areas (slug, name, description, icon, sort_order, is_active)
values (
  'area-fiscale',
  'Area Fiscale',
  'Dati e calcoli fiscali e spazio commercialista',
  'landmark',
  55,
  true
)
on conflict (slug) do update
set
  name = excluded.name,
  description = excluded.description,
  icon = excluded.icon,
  sort_order = excluded.sort_order,
  is_active = true;

-- Ordine menu DB allineato (sidebar ha anche ordine esplicito)
update public.areas set sort_order = 50 where slug = 'hr';
update public.areas set sort_order = 55 where slug = 'area-fiscale';
update public.areas set sort_order = 99 where slug = 'impostazioni';

-- Permessi: superadmin + admin (tutte le aree); manager (tutte tranne impostazioni)
insert into public.role_area_permissions (role_id, area_id, can_access)
select r.id, a.id, true
from public.app_roles r
cross join public.areas a
where a.slug = 'area-fiscale'
  and r.code in ('superadmin', 'admin', 'manager')
on conflict (role_id, area_id) do update set can_access = true;

-- RLS dashboard fiscale: accesso anche da area-fiscale
drop policy if exists "adempimenti_fiscali_select" on public.adempimenti_fiscali;
create policy "adempimenti_fiscali_select"
  on public.adempimenti_fiscali for select to authenticated
  using (
    public.has_area_access('amministrazione')
    or public.has_area_access('area-fiscale')
    or public.is_superadmin()
  );

drop policy if exists "adempimenti_fiscali_write" on public.adempimenti_fiscali;
create policy "adempimenti_fiscali_write"
  on public.adempimenti_fiscali for all to authenticated
  using (
    public.has_area_access('amministrazione')
    or public.has_area_access('area-fiscale')
    or public.is_superadmin()
  )
  with check (
    public.has_area_access('amministrazione')
    or public.has_area_access('area-fiscale')
    or public.is_superadmin()
  );

drop policy if exists "dashboard_fiscale_snapshots_select"
  on public.dashboard_fiscale_snapshots;
create policy "dashboard_fiscale_snapshots_select"
  on public.dashboard_fiscale_snapshots for select to authenticated
  using (
    public.has_area_access('amministrazione')
    or public.has_area_access('area-fiscale')
    or public.is_superadmin()
  );

drop policy if exists "dashboard_fiscale_snapshots_insert"
  on public.dashboard_fiscale_snapshots;
create policy "dashboard_fiscale_snapshots_insert"
  on public.dashboard_fiscale_snapshots for insert to authenticated
  with check (
    public.has_area_access('amministrazione')
    or public.has_area_access('area-fiscale')
    or public.is_superadmin()
  );

-- Profilo fiscale: lettura anche da Area Fiscale (scrittura resta Impostazioni / superadmin)
drop policy if exists "company_fiscal_profile_select" on public.company_fiscal_profile;
create policy "company_fiscal_profile_select"
  on public.company_fiscal_profile for select to authenticated
  using (
    public.has_area_access('amministrazione')
    or public.has_area_access('area-fiscale')
    or public.has_area_access('impostazioni')
    or public.is_superadmin()
  );

drop policy if exists "company_fiscal_profile_audit_select"
  on public.company_fiscal_profile_audit;
create policy "company_fiscal_profile_audit_select"
  on public.company_fiscal_profile_audit for select to authenticated
  using (
    public.has_area_access('amministrazione')
    or public.has_area_access('area-fiscale')
    or public.has_area_access('impostazioni')
    or public.is_superadmin()
  );
