-- Schede materia prima: elenco codici interni per tag "Fornitore di"

create table public.materie_prime (
  id uuid primary key default gen_random_uuid(),
  codice text not null unique,
  nome text not null,
  note text not null default '',
  created_by uuid references auth.users (id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint materie_prime_codice_len check (char_length(trim(codice)) >= 1),
  constraint materie_prime_nome_len check (char_length(trim(nome)) >= 1)
);

comment on table public.materie_prime is 'Anagrafica materie prime (Amministrazione → Schede)';
comment on column public.materie_prime.codice is 'Codice interno materia prima usato nei tag fornitori';

create index materie_prime_codice_idx on public.materie_prime (codice);
create index materie_prime_nome_idx on public.materie_prime (nome);
create index materie_prime_created_at_idx on public.materie_prime (created_at desc);

create trigger materie_prime_updated_at
  before update on public.materie_prime
  for each row execute function public.set_updated_at();

alter table public.materie_prime enable row level security;

create policy "materie_prime_select_amministrazione"
  on public.materie_prime for select
  to authenticated
  using (public.has_area_access('amministrazione') or public.is_superadmin());

create policy "materie_prime_insert_amministrazione"
  on public.materie_prime for insert
  to authenticated
  with check (public.has_area_access('amministrazione') or public.is_superadmin());

create policy "materie_prime_update_amministrazione"
  on public.materie_prime for update
  to authenticated
  using (public.has_area_access('amministrazione') or public.is_superadmin())
  with check (public.has_area_access('amministrazione') or public.is_superadmin());

grant all on table public.materie_prime to postgres, service_role;
grant select, insert, update on table public.materie_prime to authenticated;
