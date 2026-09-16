-- Settori di appartenenza prodotti propri Agrinsicilia (ISO 9001).
-- Catalogo estendibile + N:N con checkbox in scheda. Soft delete, audit, no delete fisico.

create table if not exists public.catalogo_settori (
  id uuid primary key default gen_random_uuid(),
  slug text not null,
  nome text not null,
  sort_order integer not null default 0,
  attivo boolean not null default true,
  versione integer not null default 1 check (versione >= 1),
  documento_stato text not null default 'approvato'
    check (documento_stato in ('bozza', 'approvato', 'chiuso')),
  created_by uuid references auth.users (id) on delete set null,
  updated_by uuid references auth.users (id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz,
  deleted_by uuid references auth.users (id) on delete set null,
  constraint catalogo_settori_slug_len check (char_length(trim(slug)) >= 1),
  constraint catalogo_settori_nome_len check (char_length(trim(nome)) >= 1)
);

create unique index if not exists catalogo_settori_slug_uidx
  on public.catalogo_settori (lower(slug))
  where deleted_at is null;

create unique index if not exists catalogo_settori_nome_uidx
  on public.catalogo_settori (lower(nome))
  where deleted_at is null;

create index if not exists catalogo_settori_sort_idx
  on public.catalogo_settori (sort_order, nome)
  where deleted_at is null;

comment on table public.catalogo_settori is
  'Settori di mercato/uso dei prodotti propri (Farmaceutica, Food, …). Estendibile.';

drop trigger if exists catalogo_settori_updated_at on public.catalogo_settori;
create trigger catalogo_settori_updated_at
  before update on public.catalogo_settori
  for each row execute function public.set_updated_at();

alter table public.catalogo_settori enable row level security;

drop policy if exists "catalogo_settori_select" on public.catalogo_settori;
create policy "catalogo_settori_select"
  on public.catalogo_settori for select
  to authenticated
  using (
    public.is_superadmin()
    or public.has_area_access('amministrazione')
    or public.has_area_access('magazzino')
    or public.has_area_access('commerciale')
    or public.has_area_access('produzione')
  );

drop policy if exists "catalogo_settori_write" on public.catalogo_settori;
create policy "catalogo_settori_write"
  on public.catalogo_settori for insert
  to authenticated
  with check (
    public.is_superadmin()
    or public.has_area_access('amministrazione')
    or public.has_area_access('magazzino')
  );

drop policy if exists "catalogo_settori_update" on public.catalogo_settori;
create policy "catalogo_settori_update"
  on public.catalogo_settori for update
  to authenticated
  using (
    public.is_superadmin()
    or public.has_area_access('amministrazione')
    or public.has_area_access('magazzino')
  )
  with check (
    public.is_superadmin()
    or public.has_area_access('amministrazione')
    or public.has_area_access('magazzino')
  );

grant select, insert, update on table public.catalogo_settori to authenticated;
grant all on table public.catalogo_settori to postgres, service_role;
revoke delete on table public.catalogo_settori from authenticated;

create table if not exists public.prodotti_propri_settori (
  id uuid primary key default gen_random_uuid(),
  prodotto_id uuid not null references public.prodotti_propri (id) on delete restrict,
  settore_id uuid not null references public.catalogo_settori (id) on delete restrict,
  created_by uuid references auth.users (id) on delete set null,
  updated_by uuid references auth.users (id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz,
  deleted_by uuid references auth.users (id) on delete set null
);

create unique index if not exists prodotti_propri_settori_uidx
  on public.prodotti_propri_settori (prodotto_id, settore_id)
  where deleted_at is null;

create index if not exists prodotti_propri_settori_prodotto_idx
  on public.prodotti_propri_settori (prodotto_id)
  where deleted_at is null;

create index if not exists prodotti_propri_settori_settore_idx
  on public.prodotti_propri_settori (settore_id)
  where deleted_at is null;

comment on table public.prodotti_propri_settori is
  'Appartenenza N:N prodotto proprio ↔ settore. Soft delete, mai delete fisico.';

drop trigger if exists prodotti_propri_settori_updated_at
  on public.prodotti_propri_settori;
create trigger prodotti_propri_settori_updated_at
  before update on public.prodotti_propri_settori
  for each row execute function public.set_updated_at();

alter table public.prodotti_propri_settori enable row level security;

drop policy if exists "prodotti_propri_settori_select" on public.prodotti_propri_settori;
create policy "prodotti_propri_settori_select"
  on public.prodotti_propri_settori for select
  to authenticated
  using (
    public.is_superadmin()
    or public.has_area_access('amministrazione')
    or public.has_area_access('magazzino')
    or public.has_area_access('commerciale')
    or public.has_area_access('produzione')
  );

drop policy if exists "prodotti_propri_settori_insert" on public.prodotti_propri_settori;
create policy "prodotti_propri_settori_insert"
  on public.prodotti_propri_settori for insert
  to authenticated
  with check (
    public.is_superadmin()
    or public.has_area_access('amministrazione')
    or public.has_area_access('magazzino')
  );

drop policy if exists "prodotti_propri_settori_update" on public.prodotti_propri_settori;
create policy "prodotti_propri_settori_update"
  on public.prodotti_propri_settori for update
  to authenticated
  using (
    public.is_superadmin()
    or public.has_area_access('amministrazione')
    or public.has_area_access('magazzino')
  )
  with check (
    public.is_superadmin()
    or public.has_area_access('amministrazione')
    or public.has_area_access('magazzino')
  );

grant select, insert, update on table public.prodotti_propri_settori to authenticated;
grant all on table public.prodotti_propri_settori to postgres, service_role;
revoke delete on table public.prodotti_propri_settori from authenticated;

insert into public.catalogo_settori (slug, nome, sort_order, attivo, versione, documento_stato)
select v.slug, v.nome, v.sort_order, true, 1, 'approvato'
from (
  values
    ('farmaceutica', 'Farmaceutica', 1),
    ('nutraceutica', 'Nutraceutica', 2),
    ('food', 'Food', 3),
    ('cosmetica', 'Cosmetica', 4),
    ('pet', 'Pet', 5)
) as v(slug, nome, sort_order)
where not exists (
  select 1
  from public.catalogo_settori s
  where s.deleted_at is null
    and (
      lower(s.slug) = lower(v.slug)
      or lower(s.nome) = lower(v.nome)
    )
);
