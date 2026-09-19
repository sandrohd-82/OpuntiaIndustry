-- Ordine delle viste sullo stesso nodo pianta (ISO: chi/quando in audit lato app).

alter table public.magazzino_mappe
  add column if not exists sort_order int not null default 0;

comment on column public.magazzino_mappe.sort_order is
  'Sequenza delle viste sullo stesso nodo menu. 0 = prima.';

create index if not exists magazzino_mappe_nodo_sort_idx
  on public.magazzino_mappe (menu_nodo_id, sort_order)
  where deleted_at is null and menu_nodo_id is not null;

update public.magazzino_mappe m
set sort_order = s.ord
from (
  select
    id,
    (
      row_number() over (
        partition by menu_nodo_id
        order by lower(vista_etichetta), created_at, id
      ) - 1
    ) as ord
  from public.magazzino_mappe
  where deleted_at is null
    and menu_nodo_id is not null
) s
where m.id = s.id;
