-- Backfill: prodotti da fatture → schede anagrafiche (merge idempotente)
-- Clienti: fatture_emesse_righe → clienti.prodotti_acquistati
-- Fornitori: fatture_ricevute_righe → fornitori.prodotti_acquistati
-- Solo codici presenti in prodotti_propri attivi; non rimuove codici già in scheda

-- ---------------------------------------------------------------------------
-- Clienti ← fatture emesse
-- ---------------------------------------------------------------------------
with invoice_codes as (
  select
    fe.cliente_id,
    coalesce(
      nullif(btrim(pp_by_id.codice), ''),
      nullif(btrim(r.codice), '')
    ) as code
  from public.fatture_emesse_righe r
  join public.fatture_emesse fe
    on fe.id = r.fattura_id
   and fe.deleted_at is null
  left join public.prodotti_propri pp_by_id
    on pp_by_id.id = r.prodotto_id
   and pp_by_id.deleted_at is null
),
valid_codes as (
  select distinct
    ic.cliente_id,
    ic.code
  from invoice_codes ic
  join public.prodotti_propri pp
    on pp.codice = ic.code
   and pp.deleted_at is null
  where ic.code is not null
    and ic.code <> '—'
),
agg as (
  select
    cliente_id,
    array_agg(code order by code) as new_codes
  from valid_codes
  group by cliente_id
)
update public.clienti c
set
  prodotti_acquistati = (
    select coalesce(array_agg(distinct u order by u), '{}'::text[])
    from unnest(
      coalesce(c.prodotti_acquistati, '{}'::text[])
      || coalesce(a.new_codes, '{}'::text[])
    ) as u
    where nullif(btrim(u), '') is not null
      and btrim(u) <> '—'
  ),
  updated_at = now()
from agg a
where c.id = a.cliente_id
  and c.deleted_at is null
  and exists (
    select 1
    from unnest(a.new_codes) as n(code)
    where not (n.code = any (coalesce(c.prodotti_acquistati, '{}'::text[])))
  );

-- ---------------------------------------------------------------------------
-- Fornitori ← fatture ricevute
-- ---------------------------------------------------------------------------
with invoice_codes as (
  select
    fr.fornitore_id,
    coalesce(
      nullif(btrim(pp_by_id.codice), ''),
      nullif(btrim(r.codice), '')
    ) as code
  from public.fatture_ricevute_righe r
  join public.fatture_ricevute fr
    on fr.id = r.fattura_id
   and fr.deleted_at is null
  left join public.prodotti_propri pp_by_id
    on pp_by_id.id = r.prodotto_id
   and pp_by_id.deleted_at is null
),
valid_codes as (
  select distinct
    ic.fornitore_id,
    ic.code
  from invoice_codes ic
  join public.prodotti_propri pp
    on pp.codice = ic.code
   and pp.deleted_at is null
  where ic.code is not null
    and ic.code <> '—'
),
agg as (
  select
    fornitore_id,
    array_agg(code order by code) as new_codes
  from valid_codes
  group by fornitore_id
)
update public.fornitori f
set
  prodotti_acquistati = (
    select coalesce(array_agg(distinct u order by u), '{}'::text[])
    from unnest(
      coalesce(f.prodotti_acquistati, '{}'::text[])
      || coalesce(a.new_codes, '{}'::text[])
    ) as u
    where nullif(btrim(u), '') is not null
      and btrim(u) <> '—'
  ),
  updated_at = now()
from agg a
where f.id = a.fornitore_id
  and f.deleted_at is null
  and exists (
    select 1
    from unnest(a.new_codes) as n(code)
    where not (n.code = any (coalesce(f.prodotti_acquistati, '{}'::text[])))
  );

do $$
begin
  raise notice 'Backfill prodotti_acquistati da fatture completato.';
end $$;
