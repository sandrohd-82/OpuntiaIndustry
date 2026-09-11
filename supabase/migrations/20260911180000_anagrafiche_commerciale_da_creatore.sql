-- ISO 9001 §8.5.2: appartenenza al creatore (non Super Admin).
-- Possibili: sempre created_by. Clienti: solo se il creatore è commerciale.

update public.clienti_possibili cp
set
  commerciale_id = cp.created_by,
  updated_at = now()
where cp.deleted_at is null
  and cp.commerciale_id is null
  and cp.created_by is not null
  and not exists (
    select 1
    from public.profiles p
    left join public.app_roles ar on ar.id = p.role_id
    where p.id = cp.created_by
      and (p.potere = 'superadmin' or ar.code = 'superadmin')
  );

update public.clienti c
set
  commerciale_id = c.created_by,
  updated_at = now()
where c.deleted_at is null
  and c.commerciale_id is null
  and c.created_by is not null
  and not exists (
    select 1
    from public.profiles p
    left join public.app_roles ar on ar.id = p.role_id
    where p.id = c.created_by
      and (p.potere = 'superadmin' or ar.code = 'superadmin')
  )
  and (
    exists (
      select 1
      from public.organigramma_persone op
      where op.user_id = c.created_by
        and op.deleted_at is null
    )
    or exists (
      select 1
      from public.profile_reparti pr
      where pr.profile_id = c.created_by
        and pr.codice = 'commerciale'
        and pr.deleted_at is null
    )
    or exists (
      select 1
      from public.profiles p
      where p.id = c.created_by
        and p.commerciale_grado is not null
    )
  );
