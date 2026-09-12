-- Catalogo mansioni rubrica (contatti esterni). Distinto da organigramma_mansioni.
-- ISO 9001: audit, soft delete, stato documento, versione. Mai delete fisico.

create table if not exists public.rubrica_mansioni (
  id uuid primary key default gen_random_uuid(),
  codice text not null,
  nome text not null,
  documento_stato text not null default 'approvato'
    check (documento_stato in ('bozza', 'approvato')),
  versione integer not null default 1,
  created_by uuid references auth.users (id) on delete set null,
  updated_by uuid references auth.users (id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz,
  deleted_by uuid references auth.users (id) on delete set null
);

create unique index if not exists rubrica_mansioni_codice_uidx
  on public.rubrica_mansioni (lower(codice))
  where deleted_at is null;

create unique index if not exists rubrica_mansioni_nome_uidx
  on public.rubrica_mansioni (lower(trim(nome)))
  where deleted_at is null;

drop trigger if exists rubrica_mansioni_updated_at on public.rubrica_mansioni;
create trigger rubrica_mansioni_updated_at
  before update on public.rubrica_mansioni
  for each row execute function public.set_updated_at();

alter table public.rubrica_mansioni enable row level security;

drop policy if exists rubrica_mansioni_select on public.rubrica_mansioni;
create policy rubrica_mansioni_select
  on public.rubrica_mansioni for select to authenticated
  using (
    deleted_at is null
    and (
      public.has_area_access('amministrazione')
      or public.has_area_access('produzione')
      or public.has_area_access('commerciale')
      or public.is_superadmin()
    )
  );

drop policy if exists rubrica_mansioni_insert on public.rubrica_mansioni;
create policy rubrica_mansioni_insert
  on public.rubrica_mansioni for insert to authenticated
  with check (
    public.has_area_access('amministrazione')
    or public.has_area_access('produzione')
    or public.has_area_access('commerciale')
    or public.is_superadmin()
  );

drop policy if exists rubrica_mansioni_update on public.rubrica_mansioni;
create policy rubrica_mansioni_update
  on public.rubrica_mansioni for update to authenticated
  using (
    public.has_area_access('amministrazione')
    or public.has_area_access('produzione')
    or public.has_area_access('commerciale')
    or public.is_superadmin()
  )
  with check (
    public.has_area_access('amministrazione')
    or public.has_area_access('produzione')
    or public.has_area_access('commerciale')
    or public.is_superadmin()
  );

grant select, insert, update on table public.rubrica_mansioni to authenticated;
grant all on table public.rubrica_mansioni to postgres, service_role;
revoke delete on table public.rubrica_mansioni from authenticated;

insert into public.rubrica_mansioni (codice, nome)
select v.codice, v.nome
from (values
  ('titolare', 'Titolare'),
  ('commerciale', 'Commerciale'),
  ('autista', 'Autista'),
  ('amministrazione', 'Amministrazione'),
  ('magazziniere', 'Magazziniere'),
  ('responsabile-acquisti', 'Responsabile acquisti'),
  ('ricezione-merce', 'Ricezione merce')
) as v(codice, nome)
where not exists (
  select 1
  from public.rubrica_mansioni m
  where m.deleted_at is null
    and (lower(m.codice) = v.codice or lower(trim(m.nome)) = lower(v.nome))
);

insert into public.rubrica_mansioni (codice, nome)
select
  left(
    coalesce(
      nullif(
        trim(both '-' from regexp_replace(
          translate(lower(trim(c.mansione)), 'àáâäèéêëìíîïòóôöùúûüç', 'aaaaeeeeiiiioooouuuuc'),
          '[^a-z0-9]+',
          '-',
          'g'
        )),
        ''
      ),
      'mansione'
    ) || '-' || substr(md5(trim(c.mansione)), 1, 6),
    60
  ),
  trim(c.mansione)
from (
  select distinct trim(mansione) as mansione
  from public.rubrica_contatti
  where deleted_at is null
    and trim(coalesce(mansione, '')) <> ''
) c
where not exists (
  select 1
  from public.rubrica_mansioni m
  where m.deleted_at is null
    and lower(trim(m.nome)) = lower(trim(c.mansione))
)
  and length(trim(c.mansione)) >= 2;

alter table public.rubrica_contatti
  add column if not exists mansione_id uuid references public.rubrica_mansioni (id);

create index if not exists rubrica_contatti_mansione_id_idx
  on public.rubrica_contatti (mansione_id)
  where deleted_at is null;

update public.rubrica_contatti c
set mansione_id = m.id
from public.rubrica_mansioni m
where c.mansione_id is null
  and c.deleted_at is null
  and m.deleted_at is null
  and lower(trim(c.mansione)) = lower(trim(m.nome));

comment on table public.rubrica_mansioni is
  'Catalogo mansioni rubrica (Titolare, Commerciale, Autista, …). Soft delete.';
