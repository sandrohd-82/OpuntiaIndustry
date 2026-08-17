-- ISO 9001: fuzzy match cataloghi acquisti (pg_trgm) + audit codifica articoli da fatture ricevute
-- Gli articoli codificati alimentano ripristino magazzino / fogli ordine acquisto.

create extension if not exists pg_trgm;

-- Indici GIN per similarity() su nome (+ note) dei cataloghi acquisti
create index if not exists catalogo_servizi_nome_trgm_idx
  on public.catalogo_servizi using gin (nome gin_trgm_ops)
  where deleted_at is null;

create index if not exists catalogo_servizi_note_trgm_idx
  on public.catalogo_servizi using gin (note gin_trgm_ops)
  where deleted_at is null;

create index if not exists catalogo_prodotti_fornitore_nome_trgm_idx
  on public.catalogo_prodotti_fornitore using gin (nome gin_trgm_ops)
  where deleted_at is null;

create index if not exists catalogo_prodotti_fornitore_note_trgm_idx
  on public.catalogo_prodotti_fornitore using gin (note gin_trgm_ops)
  where deleted_at is null;

create index if not exists materie_prime_nome_trgm_idx
  on public.materie_prime using gin (nome gin_trgm_ops)
  where deleted_at is null;

create index if not exists materie_prime_note_trgm_idx
  on public.materie_prime using gin (note gin_trgm_ops)
  where deleted_at is null;

-- Audit immutabile: conferma codifica riga ricevuta ↔ articolo catalogo
create table if not exists public.fatture_ricevute_codifica_articoli (
  id uuid primary key default gen_random_uuid(),
  fattura_ricevuta_id uuid references public.fatture_ricevute (id) on delete set null,
  fattura_riga_id uuid references public.fatture_ricevute_righe (id) on delete set null,
  testo_originale text not null,
  testo_normalizzato text not null default '',
  codice_assegnato text not null,
  catalogo_kind text not null
    check (catalogo_kind in ('servizio', 'prodotto', 'materia')),
  catalogo_id uuid,
  affinita_percentuale numeric(5, 2),
  azione text not null
    check (azione in ('associa_esistente', 'crea_nuovo')),
  note text not null default '',
  created_by uuid references auth.users (id) on delete set null,
  created_at timestamptz not null default now(),
  constraint fatture_ricevute_codifica_articoli_affinita_check
    check (
      affinita_percentuale is null
      or (affinita_percentuale >= 0 and affinita_percentuale <= 100)
    )
);

comment on table public.fatture_ricevute_codifica_articoli is
  'Registro immutabile (ISO 9001) della codifica articoli da fatture ricevute: testo SDI, codice assegnato, operatore. Base per ripristino magazzino / fogli ordine.';

comment on column public.fatture_ricevute_codifica_articoli.testo_originale is
  'Descrizione grezza della riga fattura (SDI/XML) al momento della conferma.';

comment on column public.fatture_ricevute_codifica_articoli.codice_assegnato is
  'SKU parlante assegnato (Sz/Pr/Mp + corpo), usato anche per processi di riacquisto.';

create index if not exists fatture_ricevute_codifica_articoli_fattura_idx
  on public.fatture_ricevute_codifica_articoli (fattura_ricevuta_id, created_at desc);

create index if not exists fatture_ricevute_codifica_articoli_codice_idx
  on public.fatture_ricevute_codifica_articoli (lower(codice_assegnato));

create index if not exists fatture_ricevute_codifica_articoli_created_idx
  on public.fatture_ricevute_codifica_articoli (created_at desc);

alter table public.fatture_ricevute_codifica_articoli enable row level security;

drop policy if exists "fatture_ricevute_codifica_articoli_select"
  on public.fatture_ricevute_codifica_articoli;
create policy "fatture_ricevute_codifica_articoli_select"
  on public.fatture_ricevute_codifica_articoli for select to authenticated
  using (public.has_area_access('amministrazione') or public.is_superadmin());

drop policy if exists "fatture_ricevute_codifica_articoli_insert"
  on public.fatture_ricevute_codifica_articoli;
create policy "fatture_ricevute_codifica_articoli_insert"
  on public.fatture_ricevute_codifica_articoli for insert to authenticated
  with check (public.has_area_access('amministrazione') or public.is_superadmin());

-- Nessun update/delete: registro immutabile
revoke update, delete on table public.fatture_ricevute_codifica_articoli from authenticated;
grant select, insert on table public.fatture_ricevute_codifica_articoli to authenticated;
grant all on table public.fatture_ricevute_codifica_articoli to postgres, service_role;

-- Match unificato su cataloghi acquisti (soglia default 0.80 = 80%)
create or replace function public.match_catalogo_acquisti(
  p_query text,
  p_threshold double precision default 0.80,
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
  )
  select *
  from ranked
  order by affinita_percentuale desc, codice asc
  limit greatest(1, least(coalesce(p_limit, 12), 50));
$$;

comment on function public.match_catalogo_acquisti(text, double precision, integer) is
  'Fuzzy match (pg_trgm) su servizi/prodotti fornitore/materie per deduplica codifica da fatture ricevute.';

grant execute on function public.match_catalogo_acquisti(text, double precision, integer)
  to authenticated, service_role;
