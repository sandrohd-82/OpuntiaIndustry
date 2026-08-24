-- Link referenti rubrica ↔ clienti / fornitori (ISO: soft link via junction)

create table if not exists public.clienti_referenti (
  id uuid primary key default gen_random_uuid(),
  cliente_id uuid not null references public.clienti (id) on delete cascade,
  contatto_id uuid not null references public.rubrica_contatti (id) on delete cascade,
  created_at timestamptz not null default now(),
  created_by uuid references auth.users (id) on delete set null,
  unique (cliente_id, contatto_id)
);

create index if not exists clienti_referenti_cliente_idx
  on public.clienti_referenti (cliente_id);
create index if not exists clienti_referenti_contatto_idx
  on public.clienti_referenti (contatto_id);

alter table public.clienti_referenti enable row level security;
create policy "clienti_referenti_all" on public.clienti_referenti
  for all to authenticated
  using (public.has_area_access('amministrazione') or public.is_superadmin())
  with check (public.has_area_access('amministrazione') or public.is_superadmin());
grant select, insert, update, delete on public.clienti_referenti to authenticated;

create table if not exists public.fornitori_referenti (
  id uuid primary key default gen_random_uuid(),
  fornitore_id uuid not null references public.fornitori (id) on delete cascade,
  contatto_id uuid not null references public.rubrica_contatti (id) on delete cascade,
  created_at timestamptz not null default now(),
  created_by uuid references auth.users (id) on delete set null,
  unique (fornitore_id, contatto_id)
);

create index if not exists fornitori_referenti_fornitore_idx
  on public.fornitori_referenti (fornitore_id);
create index if not exists fornitori_referenti_contatto_idx
  on public.fornitori_referenti (contatto_id);

alter table public.fornitori_referenti enable row level security;
create policy "fornitori_referenti_all" on public.fornitori_referenti
  for all to authenticated
  using (public.has_area_access('amministrazione') or public.is_superadmin())
  with check (public.has_area_access('amministrazione') or public.is_superadmin());
grant select, insert, update, delete on public.fornitori_referenti to authenticated;
