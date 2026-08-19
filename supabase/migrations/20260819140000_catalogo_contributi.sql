-- Catalogo contributi (Ct) + scheda fornitore — ISO 9001

alter table public.fornitori
  add column if not exists contributi_offerti text[] not null default '{}'::text[];

comment on column public.fornitori.contributi_offerti is
  'Codici da catalogo_contributi (es. CONAI)';

comment on column public.fornitori.tipologie is
  'Valori ammessi: servizio, prodotto, materia_prima, contributo (multi)';

create table if not exists public.catalogo_contributi (
  id uuid primary key default gen_random_uuid(),
  codice text not null,
  nome text not null,
  note text not null default '',
  is_bio boolean not null default false,
  created_by uuid references auth.users (id) on delete set null,
  updated_by uuid references auth.users (id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz,
  deleted_by uuid references auth.users (id) on delete set null,
  pending_delete_at timestamptz,
  pending_delete_by uuid references auth.users (id) on delete set null,
  constraint catalogo_contributi_codice_check
    check (codice ~* '^ct[A-Za-z0-9\-_\/]+$')
);

comment on table public.catalogo_contributi is
  'Contributi ambientali/fiscali su fatture (es. CONAI Fascia B1.1) — soft delete';

create unique index if not exists catalogo_contributi_codice_lower_uidx
  on public.catalogo_contributi (lower(codice))
  where deleted_at is null;

create index if not exists catalogo_contributi_nome_idx
  on public.catalogo_contributi (nome)
  where deleted_at is null;

create index if not exists catalogo_contributi_pending_delete_idx
  on public.catalogo_contributi (pending_delete_at)
  where pending_delete_at is not null;

create index if not exists catalogo_contributi_nome_trgm_idx
  on public.catalogo_contributi using gin (nome gin_trgm_ops)
  where deleted_at is null;

create index if not exists catalogo_contributi_note_trgm_idx
  on public.catalogo_contributi using gin (note gin_trgm_ops)
  where deleted_at is null;

drop trigger if exists catalogo_contributi_updated_at on public.catalogo_contributi;
create trigger catalogo_contributi_updated_at
  before update on public.catalogo_contributi
  for each row execute function public.set_updated_at();

alter table public.catalogo_contributi enable row level security;

drop policy if exists "catalogo_contributi_select_amm" on public.catalogo_contributi;
create policy "catalogo_contributi_select_amm"
  on public.catalogo_contributi for select to authenticated
  using (public.has_area_access('amministrazione') or public.is_superadmin());

drop policy if exists "catalogo_contributi_insert_amm" on public.catalogo_contributi;
create policy "catalogo_contributi_insert_amm"
  on public.catalogo_contributi for insert to authenticated
  with check (public.has_area_access('amministrazione') or public.is_superadmin());

drop policy if exists "catalogo_contributi_update_amm" on public.catalogo_contributi;
create policy "catalogo_contributi_update_amm"
  on public.catalogo_contributi for update to authenticated
  using (public.has_area_access('amministrazione') or public.is_superadmin())
  with check (public.has_area_access('amministrazione') or public.is_superadmin());

grant select, insert, update on table public.catalogo_contributi to authenticated;
grant all on table public.catalogo_contributi to postgres, service_role;

-- Collegamenti articoli: kind contributo
alter table public.catalogo_articoli_collegamenti
  drop constraint if exists catalogo_articoli_collegamenti_kind_a_check;
alter table public.catalogo_articoli_collegamenti
  drop constraint if exists catalogo_articoli_collegamenti_kind_b_check;

alter table public.catalogo_articoli_collegamenti
  add constraint catalogo_articoli_collegamenti_kind_a_check
    check (kind_a in ('servizio', 'prodotto', 'materia', 'contributo'));
alter table public.catalogo_articoli_collegamenti
  add constraint catalogo_articoli_collegamenti_kind_b_check
    check (kind_b in ('servizio', 'prodotto', 'materia', 'contributo'));

-- Codifica audit kind
alter table public.fatture_ricevute_codifica_articoli
  drop constraint if exists fatture_ricevute_codifica_articoli_catalogo_kind_check;
alter table public.fatture_ricevute_codifica_articoli
  add constraint fatture_ricevute_codifica_articoli_catalogo_kind_check
    check (catalogo_kind in ('servizio', 'prodotto', 'materia', 'contributo'));

-- Fuzzy match include contributi
create or replace function public.match_catalogo_acquisti(
  p_query text,
  p_threshold double precision default 0.3,
  p_limit integer default 12
)
returns table (
  catalogo_kind text,
  catalogo_id uuid,
  codice text,
  nome text,
  affinita_percentuale numeric
)
language sql
stable
security invoker
set search_path = public
as $$
  with q as (
    select nullif(trim(p_query), '') as query
  ),
  ranked as (
    select
      'servizio'::text as catalogo_kind,
      s.id as catalogo_id,
      s.codice,
      s.nome,
      round(
        (
          greatest(
            similarity(s.nome, q.query),
            similarity(coalesce(s.note, ''), q.query)
          ) * 100
        )::numeric,
        2
      ) as affinita_percentuale
    from public.catalogo_servizi s
    cross join q
    where q.query is not null
      and s.deleted_at is null
      and greatest(
        similarity(s.nome, q.query),
        similarity(coalesce(s.note, ''), q.query)
      ) >= p_threshold

    union all

    select
      'prodotto'::text,
      p.id,
      p.codice,
      p.nome,
      round(
        (
          greatest(
            similarity(p.nome, q.query),
            similarity(coalesce(p.note, ''), q.query)
          ) * 100
        )::numeric,
        2
      )
    from public.catalogo_prodotti_fornitore p
    cross join q
    where q.query is not null
      and p.deleted_at is null
      and greatest(
        similarity(p.nome, q.query),
        similarity(coalesce(p.note, ''), q.query)
      ) >= p_threshold

    union all

    select
      'materia'::text,
      m.id,
      m.codice,
      m.nome,
      round(
        (
          greatest(
            similarity(m.nome, q.query),
            similarity(coalesce(m.note, ''), q.query)
          ) * 100
        )::numeric,
        2
      )
    from public.materie_prime m
    cross join q
    where q.query is not null
      and m.deleted_at is null
      and greatest(
        similarity(m.nome, q.query),
        similarity(coalesce(m.note, ''), q.query)
      ) >= p_threshold

    union all

    select
      'contributo'::text,
      c.id,
      c.codice,
      c.nome,
      round(
        (
          greatest(
            similarity(c.nome, q.query),
            similarity(coalesce(c.note, ''), q.query)
          ) * 100
        )::numeric,
        2
      )
    from public.catalogo_contributi c
    cross join q
    where q.query is not null
      and c.deleted_at is null
      and greatest(
        similarity(c.nome, q.query),
        similarity(coalesce(c.note, ''), q.query)
      ) >= p_threshold
  )
  select *
  from ranked
  order by affinita_percentuale desc, codice asc
  limit greatest(1, least(coalesce(p_limit, 12), 50));
$$;

comment on function public.match_catalogo_acquisti(text, double precision, integer) is
  'Fuzzy match (pg_trgm) su servizi/prodotti/materie/contributi per codifica da fatture ricevute.';
