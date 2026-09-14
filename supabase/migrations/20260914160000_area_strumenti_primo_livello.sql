-- Area Strumenti di primo livello (ISO 9001 §7.5 / 6.1).
-- Posizione menu: tra Area Fiscale e Gestionale Fornitori.

insert into public.areas (slug, name, description, icon, sort_order, is_active)
values (
  'strumenti',
  'Strumenti',
  'Generatore e decifratore lotti, barcode e utilità del gestionale',
  'wrench',
  57,
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
where a.slug = 'strumenti'
  and r.code in ('superadmin', 'admin', 'manager', 'operator')
on conflict (role_id, area_id) do update set can_access = true;

drop policy if exists lotti_esterni_write on public.lotti_esterni;
create policy lotti_esterni_write
  on public.lotti_esterni for all to authenticated
  using (
    public.has_area_access('strumenti')
    or public.has_area_access('produzione')
    or public.has_area_access('magazzino')
    or public.has_area_access('amministrazione')
    or public.is_superadmin()
  )
  with check (
    public.has_area_access('strumenti')
    or public.has_area_access('produzione')
    or public.has_area_access('magazzino')
    or public.has_area_access('amministrazione')
    or public.is_superadmin()
  );

drop policy if exists lotti_esterni_comp_write on public.lotti_esterni_componenti;
create policy lotti_esterni_comp_write
  on public.lotti_esterni_componenti for all to authenticated
  using (
    public.has_area_access('strumenti')
    or public.has_area_access('produzione')
    or public.has_area_access('magazzino')
    or public.has_area_access('amministrazione')
    or public.is_superadmin()
  )
  with check (
    public.has_area_access('strumenti')
    or public.has_area_access('produzione')
    or public.has_area_access('magazzino')
    or public.has_area_access('amministrazione')
    or public.is_superadmin()
  );

-- Sposta le chiavi On/Off dal ramo Produzione al nuovo path di primo livello.
update public.profile_page_access p
set
  page_key = replace(p.page_key, '/app/produzione/strumenti', '/app/strumenti'),
  updated_at = now()
where p.deleted_at is null
  and p.page_key like '/app/produzione/strumenti%'
  and not exists (
    select 1
    from public.profile_page_access x
    where x.profile_id = p.profile_id
      and x.page_key = replace(p.page_key, '/app/produzione/strumenti', '/app/strumenti')
      and x.deleted_at is null
  );

insert into public.profile_page_access (
  profile_id,
  page_key,
  visibile,
  created_by,
  updated_by
)
select distinct
  p.profile_id,
  k.page_key,
  true,
  p.profile_id,
  p.profile_id
from public.profile_page_access p
cross join (
  values
    ('/app/strumenti'),
    ('/app/strumenti/generatore-lotti'),
    ('/app/strumenti/decifratore'),
    ('/app/strumenti/generatore-barcode'),
    ('/app/strumenti/barcode-mp'),
    ('/app/strumenti/barcode-prodotti')
) as k(page_key)
where p.deleted_at is null
  and p.visibile is true
  and (
    p.page_key = '/app/produzione'
    or p.page_key = '/app/magazzino'
    or p.page_key like '/app/produzione/strumenti%'
    or p.page_key like '/app/strumenti%'
  )
  and not exists (
    select 1
    from public.profile_page_access x
    where x.profile_id = p.profile_id
      and x.page_key = k.page_key
      and x.deleted_at is null
  );
