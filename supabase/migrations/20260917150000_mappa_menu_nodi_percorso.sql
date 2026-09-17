-- Percorso di menu a livelli per le piante (ISO 9001).
-- Primo livello = area gestionale; i nodi sono rami o posti (luogo).

create table if not exists public.mappa_menu_nodi (
  id uuid primary key default gen_random_uuid(),
  parent_id uuid references public.mappa_menu_nodi (id) on delete restrict,
  area_slug text not null,
  etichetta text not null,
  slug text not null,
  tipo text not null default 'ramo',
  sort_order int not null default 0,
  documento_stato text not null default 'bozza',
  versione int not null default 1,
  created_by uuid references auth.users (id) on delete set null,
  updated_by uuid references auth.users (id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz,
  deleted_by uuid references auth.users (id) on delete set null,
  constraint mag_menu_tipo_check check (tipo in ('ramo', 'luogo')),
  constraint mag_menu_stato_check check (
    documento_stato in ('bozza', 'approvato', 'chiuso')
  ),
  constraint mag_menu_etichetta_check check (char_length(trim(etichetta)) between 1 and 120),
  constraint mag_menu_slug_check check (char_length(trim(slug)) between 1 and 80)
);

create unique index if not exists mag_menu_etichetta_uidx
  on public.mappa_menu_nodi (
    area_slug,
    coalesce(parent_id, '00000000-0000-0000-0000-000000000000'),
    lower(etichetta)
  )
  where deleted_at is null;

create unique index if not exists mag_menu_slug_uidx
  on public.mappa_menu_nodi (
    area_slug,
    coalesce(parent_id, '00000000-0000-0000-0000-000000000000'),
    slug
  )
  where deleted_at is null;

create index if not exists mag_menu_parent_idx
  on public.mappa_menu_nodi (area_slug, parent_id, sort_order)
  where deleted_at is null;

comment on table public.mappa_menu_nodi is
  'Rami e posti del menu piante. Il primo livello è l''area gestionale (non è un nodo).';

drop trigger if exists mag_menu_updated_at on public.mappa_menu_nodi;
create trigger mag_menu_updated_at
  before update on public.mappa_menu_nodi
  for each row execute function public.set_updated_at();

alter table public.mappa_menu_nodi enable row level security;
drop policy if exists "mag_menu_select" on public.mappa_menu_nodi;
create policy "mag_menu_select"
  on public.mappa_menu_nodi for select
  to authenticated
  using (
    public.is_superadmin()
    or public.has_area_access(area_slug)
    or public.has_area_access('strumenti')
    or public.has_area_access('amministrazione')
  );
drop policy if exists "mag_menu_write" on public.mappa_menu_nodi;
create policy "mag_menu_write"
  on public.mappa_menu_nodi for insert
  to authenticated
  with check (
    public.is_superadmin()
    or public.has_area_access('amministrazione')
  );
drop policy if exists "mag_menu_update" on public.mappa_menu_nodi;
create policy "mag_menu_update"
  on public.mappa_menu_nodi for update
  to authenticated
  using (
    public.is_superadmin()
    or public.has_area_access('amministrazione')
  )
  with check (
    public.is_superadmin()
    or public.has_area_access('amministrazione')
  );

grant select, insert, update on table public.mappa_menu_nodi to authenticated;
grant all on table public.mappa_menu_nodi to postgres, service_role;
revoke delete on table public.mappa_menu_nodi from authenticated;

alter table public.magazzino_mappe
  add column if not exists menu_nodo_id uuid references public.mappa_menu_nodi (id) on delete set null;

alter table public.magazzino_mappe
  drop constraint if exists mag_mappe_area_codice_check;

drop index if exists public.magazzino_mappe_collegata_luogo_vista_uidx;

create unique index if not exists magazzino_mappe_collegata_nodo_vista_uidx
  on public.magazzino_mappe (menu_nodo_id, lower(vista_etichetta))
  where deleted_at is null
    and documento_stato = 'approvato'
    and menu_nodo_id is not null;

-- Seme: Magazzino > Mappa Magazzino
insert into public.mappa_menu_nodi (
  id, parent_id, area_slug, etichetta, slug, tipo, documento_stato, sort_order
)
values (
  '11111111-1111-4111-8111-111111111111',
  null,
  'magazzino',
  'Mappa Magazzino',
  'mappa',
  'ramo',
  'approvato',
  0
)
on conflict (id) do nothing;

-- Posti già collegati
insert into public.mappa_menu_nodi (
  parent_id, area_slug, etichetta, slug, tipo, documento_stato, sort_order
)
select
  '11111111-1111-4111-8111-111111111111',
  'magazzino',
  trim(m.luogo_nome),
  coalesce(
    nullif(left(regexp_replace(lower(trim(m.luogo_nome)), '[^a-z0-9]+', '-', 'g'), 80), ''),
    'posto'
  ),
  'luogo',
  'approvato',
  0
from public.magazzino_mappe m
where m.deleted_at is null
  and m.luogo_nome <> ''
  and m.documento_stato = 'approvato'
group by trim(m.luogo_nome)
on conflict do nothing;

update public.magazzino_mappe mp
set menu_nodo_id = n.id
from public.mappa_menu_nodi n
where mp.menu_nodo_id is null
  and mp.deleted_at is null
  and n.deleted_at is null
  and n.area_slug = 'magazzino'
  and n.tipo = 'luogo'
  and n.parent_id = '11111111-1111-4111-8111-111111111111'
  and lower(trim(n.etichetta)) = lower(trim(mp.luogo_nome));

notify pgrst, 'reload schema';
