-- ISO 9001: legami articolo↔articolo (bidirezionali) per ricerche collegate.
-- Non implica stesso codice SKU: solo relazione operativa (es. folcone ↔ bastone).

create table if not exists public.catalogo_articoli_collegamenti (
  id uuid primary key default gen_random_uuid(),
  kind_a text not null
    check (kind_a in ('servizio', 'prodotto', 'materia')),
  articolo_a_id uuid not null,
  kind_b text not null
    check (kind_b in ('servizio', 'prodotto', 'materia')),
  articolo_b_id uuid not null,
  note text not null default '',
  created_by uuid references auth.users (id) on delete set null,
  updated_by uuid references auth.users (id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz,
  deleted_by uuid references auth.users (id) on delete set null,
  constraint catalogo_articoli_collegamenti_no_self check (
    not (kind_a = kind_b and articolo_a_id = articolo_b_id)
  ),
  constraint catalogo_articoli_collegamenti_ordered check (
    (kind_a, articolo_a_id::text) < (kind_b, articolo_b_id::text)
  )
);

comment on table public.catalogo_articoli_collegamenti is
  'Legami bidirezionali tra articoli catalogo (Sz/Pr/Mp). Soft delete; audit ISO.';

create unique index if not exists catalogo_articoli_collegamenti_pair_uidx
  on public.catalogo_articoli_collegamenti (kind_a, articolo_a_id, kind_b, articolo_b_id)
  where deleted_at is null;

create index if not exists catalogo_articoli_collegamenti_a_idx
  on public.catalogo_articoli_collegamenti (kind_a, articolo_a_id)
  where deleted_at is null;

create index if not exists catalogo_articoli_collegamenti_b_idx
  on public.catalogo_articoli_collegamenti (kind_b, articolo_b_id)
  where deleted_at is null;

drop trigger if exists catalogo_articoli_collegamenti_updated_at
  on public.catalogo_articoli_collegamenti;
create trigger catalogo_articoli_collegamenti_updated_at
  before update on public.catalogo_articoli_collegamenti
  for each row execute function public.set_updated_at();

alter table public.catalogo_articoli_collegamenti enable row level security;

drop policy if exists "catalogo_articoli_collegamenti_select_amm"
  on public.catalogo_articoli_collegamenti;
create policy "catalogo_articoli_collegamenti_select_amm"
  on public.catalogo_articoli_collegamenti for select to authenticated
  using (public.has_area_access('amministrazione') or public.is_superadmin());

drop policy if exists "catalogo_articoli_collegamenti_insert_amm"
  on public.catalogo_articoli_collegamenti;
create policy "catalogo_articoli_collegamenti_insert_amm"
  on public.catalogo_articoli_collegamenti for insert to authenticated
  with check (public.has_area_access('amministrazione') or public.is_superadmin());

drop policy if exists "catalogo_articoli_collegamenti_update_amm"
  on public.catalogo_articoli_collegamenti;
create policy "catalogo_articoli_collegamenti_update_amm"
  on public.catalogo_articoli_collegamenti for update to authenticated
  using (public.has_area_access('amministrazione') or public.is_superadmin())
  with check (public.has_area_access('amministrazione') or public.is_superadmin());

grant select, insert, update on table public.catalogo_articoli_collegamenti to authenticated;
grant all on table public.catalogo_articoli_collegamenti to postgres, service_role;
