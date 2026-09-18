-- Origine del posto = foglio dove è davvero disegnato.
-- Evita che Salva bozza su un altro foglio (es. Lato fronte) rubi
-- mappa_origine_id alle colonne della Vista sopra.
update public.magazzino_ubicazioni u
set
  mappa_origine_id = d.mappa_id,
  updated_at = now()
from (
  select distinct on (a.ubicazione_id)
    a.ubicazione_id,
    a.mappa_id
  from public.magazzino_mappa_aree a
  join public.magazzino_mappe m
    on m.id = a.mappa_id
    and m.deleted_at is null
  where a.deleted_at is null
    and a.ubicazione_id is not null
  order by
    a.ubicazione_id,
    case when m.documento_stato = 'approvato' then 0 else 1 end,
    a.created_at
) d
where u.id = d.ubicazione_id
  and u.deleted_at is null
  and u.mappa_origine_id is distinct from d.mappa_id
  and not exists (
    select 1
    from public.magazzino_mappa_aree x
    where x.deleted_at is null
      and x.ubicazione_id = u.id
      and x.mappa_id = u.mappa_origine_id
  );
