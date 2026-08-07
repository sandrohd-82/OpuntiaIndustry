-- Admin e superadmin: stesse aree / azioni (differenziazione ruoli a fine progetto)

insert into public.role_area_permissions (role_id, area_id, can_access)
select r.id, a.id, true
from public.app_roles r
cross join public.areas a
where r.code = 'admin'
on conflict (role_id, area_id) do update set can_access = true;

update public.areas
set description = 'Configurazione sistema e Google Authenticator'
where slug = 'impostazioni';

update public.app_roles
set description = 'Accesso completo a tutte le aree (temporaneamente equivalente a superadmin)'
where code = 'admin';

update public.app_roles
set description = 'Accesso completo a tutte le aree (temporaneamente equivalente ad admin)'
where code = 'superadmin';
