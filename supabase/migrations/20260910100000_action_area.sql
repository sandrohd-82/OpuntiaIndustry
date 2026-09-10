-- Area Action: scheletro menu IoT (dispositivi, sensori, azioni, programmi).
-- Nessuna tabella operativa: i moduli arriveranno in seguito (ISO 9001).

insert into public.areas (slug, name, description, icon, sort_order, is_active)
values (
  'action',
  'Action',
  'IoT: motori, essiccatori, macchine, sensori, azioni e programmi',
  'bolt',
  25,
  true
)
on conflict (slug) do update
set
  name = excluded.name,
  description = excluded.description,
  icon = excluded.icon,
  sort_order = excluded.sort_order,
  is_active = true;

insert into public.role_area_permissions (role_id, area_id, can_access)
select r.id, a.id, true
from public.app_roles r
cross join public.areas a
where a.slug = 'action'
  and r.code in ('superadmin', 'admin', 'manager', 'operator')
on conflict (role_id, area_id) do update set can_access = true;
