-- Match catalogo: usare operatore % (GIN) invece di similarity() nel WHERE
-- (evita seq-scan multi-minuto). Solo nome+codice; timeout 1.5s.
-- Indici GIN anche su codice.

create index if not exists catalogo_servizi_codice_trgm_idx
  on public.catalogo_servizi using gin (codice gin_trgm_ops)
  where deleted_at is null;

create index if not exists catalogo_prodotti_fornitore_codice_trgm_idx
  on public.catalogo_prodotti_fornitore using gin (codice gin_trgm_ops)
  where deleted_at is null;

create index if not exists materie_prime_codice_trgm_idx
  on public.materie_prime using gin (codice gin_trgm_ops)
  where deleted_at is null;

create index if not exists catalogo_contributi_codice_trgm_idx
  on public.catalogo_contributi using gin (codice gin_trgm_ops)
  where deleted_at is null;

create index if not exists catalogo_contributi_nome_trgm_idx
  on public.catalogo_contributi using gin (nome gin_trgm_ops)
  where deleted_at is null;

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
language plpgsql
stable
security invoker
set search_path = public
as $$
declare
  v_query text := nullif(trim(p_query), '');
  v_thr double precision := greatest(0.15, least(coalesce(p_threshold, 0.3), 0.95));
  v_limit integer := greatest(1, least(coalesce(p_limit, 12), 120));
  -- soglia operatore % (usa GIN); più bassa del filtro finale
  v_gin_thr double precision := least(v_thr, 0.3);
begin
  -- Evita query bloccanti: meglio 0 risultati che UI congelata
  perform set_config('statement_timeout', '1500', true);
  perform set_config('pg_trgm.similarity_threshold', v_gin_thr::text, true);

  if v_query is null then
    return;
  end if;

  return query
  with ranked as (
    select
      'servizio'::text as catalogo_kind,
      s.id as catalogo_id,
      s.codice,
      s.nome,
      round(
        (greatest(similarity(s.nome, v_query), similarity(s.codice, v_query)) * 100)::numeric,
        2
      ) as affinita_percentuale
    from public.catalogo_servizi s
    where s.deleted_at is null
      and (s.nome % v_query or s.codice % v_query)
      and greatest(similarity(s.nome, v_query), similarity(s.codice, v_query)) >= v_thr

    union all

    select
      'prodotto'::text,
      p.id,
      p.codice,
      p.nome,
      round(
        (greatest(similarity(p.nome, v_query), similarity(p.codice, v_query)) * 100)::numeric,
        2
      )
    from public.catalogo_prodotti_fornitore p
    where p.deleted_at is null
      and (p.nome % v_query or p.codice % v_query)
      and greatest(similarity(p.nome, v_query), similarity(p.codice, v_query)) >= v_thr

    union all

    select
      'materia'::text,
      m.id,
      m.codice,
      m.nome,
      round(
        (greatest(similarity(m.nome, v_query), similarity(m.codice, v_query)) * 100)::numeric,
        2
      )
    from public.materie_prime m
    where m.deleted_at is null
      and (m.nome % v_query or m.codice % v_query)
      and greatest(similarity(m.nome, v_query), similarity(m.codice, v_query)) >= v_thr

    union all

    select
      'contributo'::text,
      c.id,
      c.codice,
      c.nome,
      round(
        (greatest(similarity(c.nome, v_query), similarity(c.codice, v_query)) * 100)::numeric,
        2
      )
    from public.catalogo_contributi c
    where c.deleted_at is null
      and (c.nome % v_query or c.codice % v_query)
      and greatest(similarity(c.nome, v_query), similarity(c.codice, v_query)) >= v_thr
  )
  select r.*
  from ranked r
  order by r.affinita_percentuale desc, r.codice asc
  limit v_limit;
end;
$$;

comment on function public.match_catalogo_acquisti(text, double precision, integer) is
  'Fuzzy match veloce (GIN % + timeout 1.5s) su nome/codice cataloghi acquisti.';
