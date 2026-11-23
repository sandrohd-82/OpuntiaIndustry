-- Ruolo del portale fornitore di materia prima.
-- Usa lo stesso RBAC delle aree. Nessun permesso aziendale.

insert into public.app_roles (code, name, description)
values (
  'fornitore',
  'Fornitore',
  'Accesso limitato all''Area fornitori. Nessun permesso aziendale.'
)
on conflict (code) do update
set name = excluded.name,
    description = excluded.description;

insert into public.role_area_permissions (role_id, area_id, can_access)
select r.id, a.id, true
from public.app_roles r
join public.areas a on a.slug = 'area-fornitori'
where r.code = 'fornitore'
on conflict (role_id, area_id) do update set can_access = true;

delete from public.role_area_permissions rap
using public.app_roles r, public.areas a
where rap.role_id = r.id
  and rap.area_id = a.id
  and r.code = 'fornitore'
  and a.slug <> 'area-fornitori';

comment on table public.app_roles is
  'Ruoli gestionali. Il ruolo fornitore vede solo l''Area fornitori.';
