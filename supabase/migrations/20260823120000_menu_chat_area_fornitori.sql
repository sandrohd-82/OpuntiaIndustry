-- Menu laterale: nuove aree Chat e Area fornitori (RBAC)
-- Opzione A — skeleton + permessi admin/manager/superadmin

insert into public.areas (slug, name, description, icon, sort_order, is_active)
values
  (
    'chat',
    'Chat',
    'Argomenti e discussioni operative',
    'messages-square',
    45,
    true
  ),
  (
    'area-fornitori',
    'Area fornitori',
    'Quaderno di campagna e calendario raccolto',
    'sprout',
    60,
    true
  )
on conflict (slug) do update
set
  name = excluded.name,
  description = excluded.description,
  icon = excluded.icon,
  sort_order = excluded.sort_order,
  is_active = true;

-- Ordine sort_order allineato al menu target
update public.areas set sort_order = 0 where slug = 'dashboard';
update public.areas set sort_order = 10 where slug = 'amministrazione';
update public.areas set sort_order = 20 where slug = 'produzione';
update public.areas set sort_order = 30 where slug = 'magazzino';
update public.areas set sort_order = 45 where slug = 'chat';
update public.areas set sort_order = 55 where slug = 'area-fiscale';
update public.areas set sort_order = 60 where slug = 'area-fornitori';
update public.areas set sort_order = 99 where slug = 'impostazioni';
-- Nascoste dal menu ma restano attive per compatibilità
update public.areas set sort_order = 200 where slug = 'commerciale';
update public.areas set sort_order = 210 where slug = 'acquisti';
update public.areas set sort_order = 220 where slug = 'hr';

insert into public.role_area_permissions (role_id, area_id, can_access)
select r.id, a.id, true
from public.app_roles r
cross join public.areas a
where a.slug in ('chat', 'area-fornitori')
  and r.code in ('superadmin', 'admin', 'manager')
on conflict (role_id, area_id) do update set can_access = true;
