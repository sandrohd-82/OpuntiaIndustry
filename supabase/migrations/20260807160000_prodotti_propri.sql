-- Schede prodotti propri (mirror materie prime, prefisso Pp)
-- Idempotente.

create table if not exists public.prodotti_propri (
  id uuid primary key default gen_random_uuid(),
  codice text not null unique,
  nome text not null,
  note text not null default '',
  is_bio boolean not null default false,
  created_by uuid references auth.users (id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

do $$
begin
  if not exists (
    select 1 from pg_constraint where conname = 'prodotti_propri_codice_len'
  ) then
    alter table public.prodotti_propri
      add constraint prodotti_propri_codice_len
      check (char_length(trim(codice)) >= 1);
  end if;

  if not exists (
    select 1 from pg_constraint where conname = 'prodotti_propri_nome_len'
  ) then
    alter table public.prodotti_propri
      add constraint prodotti_propri_nome_len
      check (char_length(trim(nome)) >= 1);
  end if;

  if not exists (
    select 1 from pg_constraint where conname = 'prodotti_propri_codice_pp'
  ) then
    alter table public.prodotti_propri
      add constraint prodotti_propri_codice_pp
      check (codice ~ '^Pp[A-Za-z0-9\-_\/]+$');
  end if;
end $$;

comment on table public.prodotti_propri is 'Anagrafica prodotti propri (Amministrazione → Schede)';
comment on column public.prodotti_propri.codice is
  'Codice interno con prefisso fisso Pp + corpo alfanumerico (- _ / ammessi)';
comment on column public.prodotti_propri.is_bio is 'Prodotto biologico';

create index if not exists prodotti_propri_codice_idx on public.prodotti_propri (codice);
create index if not exists prodotti_propri_nome_idx on public.prodotti_propri (nome);
create index if not exists prodotti_propri_created_at_idx on public.prodotti_propri (created_at desc);

drop trigger if exists prodotti_propri_updated_at on public.prodotti_propri;
create trigger prodotti_propri_updated_at
  before update on public.prodotti_propri
  for each row execute function public.set_updated_at();

alter table public.prodotti_propri enable row level security;

drop policy if exists "prodotti_propri_select_amministrazione" on public.prodotti_propri;
create policy "prodotti_propri_select_amministrazione"
  on public.prodotti_propri for select
  to authenticated
  using (public.has_area_access('amministrazione') or public.is_superadmin());

drop policy if exists "prodotti_propri_insert_amministrazione" on public.prodotti_propri;
create policy "prodotti_propri_insert_amministrazione"
  on public.prodotti_propri for insert
  to authenticated
  with check (public.has_area_access('amministrazione') or public.is_superadmin());

drop policy if exists "prodotti_propri_update_amministrazione" on public.prodotti_propri;
create policy "prodotti_propri_update_amministrazione"
  on public.prodotti_propri for update
  to authenticated
  using (public.has_area_access('amministrazione') or public.is_superadmin())
  with check (public.has_area_access('amministrazione') or public.is_superadmin());

grant all on table public.prodotti_propri to postgres, service_role;
grant select, insert, update on table public.prodotti_propri to authenticated;
