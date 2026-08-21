-- Match catalogo acquisti più veloce e utile per ricerca «Cerca codice»:
-- - similarity anche sul codice
-- - limite fino a 120 (prima bloccato a 50)

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
            similarity(s.codice, q.query),
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
        similarity(s.codice, q.query),
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
            similarity(p.codice, q.query),
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
        similarity(p.codice, q.query),
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
            similarity(m.codice, q.query),
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
        similarity(m.codice, q.query),
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
            similarity(c.codice, q.query),
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
        similarity(c.codice, q.query),
        similarity(coalesce(c.note, ''), q.query)
      ) >= p_threshold
  )
  select *
  from ranked
  order by affinita_percentuale desc, codice asc
  limit greatest(1, least(coalesce(p_limit, 12), 120));
$$;

comment on function public.match_catalogo_acquisti(text, double precision, integer) is
  'Fuzzy match (pg_trgm) veloce su servizi/prodotti/materie/contributi (nome+codice+note).';
