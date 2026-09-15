-- Commerciale di primo livello (ISO 9001 §7.5 / 6.1).
-- Stessi On/Off pagina già impostati: si riusano le chiavi Amministrazione / Area Fiscale.

insert into public.areas (slug, name, description, icon, sort_order, is_active)
values (
  'commerciale',
  'Commerciale',
  'Clienti, possibili clienti, preventivi, ordini, listino e nuova fattura',
  'handshake',
  12,
  true
)
on conflict (slug) do update
set
  name = excluded.name,
  description = excluded.description,
  icon = excluded.icon,
  sort_order = excluded.sort_order,
  is_active = true;

-- Chi ha già Amministrazione (ruolo) riceve Commerciale, senza togliere nulla.
insert into public.role_area_permissions (role_id, area_id, can_access)
select r.id, a.id, true
from public.app_roles r
cross join public.areas a
where a.slug = 'commerciale'
  and r.code in ('superadmin', 'admin', 'manager', 'operator')
  and exists (
    select 1
    from public.role_area_permissions p
    join public.areas amm on amm.id = p.area_id
    where p.role_id = r.id
      and amm.slug = 'amministrazione'
      and p.can_access is true
  )
on conflict (role_id, area_id) do update set can_access = true;

-- Area On se l’operatore aveva già Amministrazione o una delle pagine spostate.
insert into public.profile_page_access (
  profile_id,
  page_key,
  visibile,
  created_by,
  updated_by
)
select distinct
  p.profile_id,
  '/app/commerciale',
  true,
  p.profile_id,
  p.profile_id
from public.profile_page_access p
where p.deleted_at is null
  and p.visibile is true
  and (
    p.page_key = '/app/amministrazione'
    or p.page_key = '/app/amministrazione/clienti'
    or p.page_key = '/app/amministrazione/clienti/elenco'
    or p.page_key = '/app/amministrazione/clienti/possibili'
    or p.page_key = '/app/amministrazione/ordini'
    or p.page_key = '/app/amministrazione/ordini/elenco'
    or p.page_key = '/app/amministrazione/ordini/nuovo'
    or p.page_key = '/app/amministrazione/ordini/crea-nuovo'
    or p.page_key = '/app/amministrazione/ordini/preventivi'
    or p.page_key = '/app/amministrazione/schede/listini-b2b'
    or p.page_key = '/app/area-fiscale/fatture/nuova'
  )
  and not exists (
    select 1
    from public.profile_page_access x
    where x.profile_id = p.profile_id
      and x.page_key = '/app/commerciale'
      and x.deleted_at is null
  );
