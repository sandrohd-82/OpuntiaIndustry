-- Backfill ISO 9001: codici da fatture ricevute → scheda fornitore
-- Sz → servizi_offerti, Pr → prodotti_fornitore, Mp → prodotti_acquistati
-- Merge idempotente; aggiunge tipologie mancanti; non rimuove codici esistenti.

-- Servizi (Sz)
with invoice_sz as (
  select distinct
    fr.fornitore_id,
    nullif(btrim(r.codice), '') as code
  from public.fatture_ricevute_righe r
  join public.fatture_ricevute fr
    on fr.id = r.fattura_id
   and fr.deleted_at is null
  join public.catalogo_servizi cs
    on lower(cs.codice) = lower(btrim(r.codice))
   and cs.deleted_at is null
  where r.codice ~* '^sz'
    and nullif(btrim(r.codice), '') is not null
    and btrim(r.codice) <> '—'
),
agg_sz as (
  select fornitore_id, array_agg(code order by code) as new_codes
  from invoice_sz
  where code is not null
  group by fornitore_id
)
update public.fornitori f
set
  servizi_offerti = (
    select coalesce(array_agg(distinct u order by u), '{}'::text[])
    from unnest(
      coalesce(f.servizi_offerti, '{}'::text[])
      || coalesce(a.new_codes, '{}'::text[])
    ) as u
    where nullif(btrim(u), '') is not null
  ),
  tipologie = case
    when 'servizio' = any (coalesce(f.tipologie, '{}'::text[])) then f.tipologie
    else coalesce(f.tipologie, '{}'::text[]) || array['servizio']
  end,
  updated_at = now()
from agg_sz a
where f.id = a.fornitore_id
  and f.deleted_at is null
  and exists (
    select 1
    from unnest(a.new_codes) as n(code)
    where not (n.code = any (coalesce(f.servizi_offerti, '{}'::text[])))
  );

-- Prodotti fornitore (Pr)
with invoice_pr as (
  select distinct
    fr.fornitore_id,
    nullif(btrim(r.codice), '') as code
  from public.fatture_ricevute_righe r
  join public.fatture_ricevute fr
    on fr.id = r.fattura_id
   and fr.deleted_at is null
  join public.catalogo_prodotti_fornitore cp
    on lower(cp.codice) = lower(btrim(r.codice))
   and cp.deleted_at is null
  where r.codice ~* '^pr'
    and nullif(btrim(r.codice), '') is not null
    and btrim(r.codice) <> '—'
),
agg_pr as (
  select fornitore_id, array_agg(code order by code) as new_codes
  from invoice_pr
  where code is not null
  group by fornitore_id
)
update public.fornitori f
set
  prodotti_fornitore = (
    select coalesce(array_agg(distinct u order by u), '{}'::text[])
    from unnest(
      coalesce(f.prodotti_fornitore, '{}'::text[])
      || coalesce(a.new_codes, '{}'::text[])
    ) as u
    where nullif(btrim(u), '') is not null
  ),
  tipologie = case
    when 'prodotto' = any (coalesce(f.tipologie, '{}'::text[])) then f.tipologie
    else coalesce(f.tipologie, '{}'::text[]) || array['prodotto']
  end,
  updated_at = now()
from agg_pr a
where f.id = a.fornitore_id
  and f.deleted_at is null
  and exists (
    select 1
    from unnest(a.new_codes) as n(code)
    where not (n.code = any (coalesce(f.prodotti_fornitore, '{}'::text[])))
  );

-- Materie prime (Mp) → prodotti_acquistati (campo scheda “Fornitore di”)
with invoice_mp as (
  select distinct
    fr.fornitore_id,
    nullif(btrim(r.codice), '') as code
  from public.fatture_ricevute_righe r
  join public.fatture_ricevute fr
    on fr.id = r.fattura_id
   and fr.deleted_at is null
  join public.materie_prime mp
    on lower(mp.codice) = lower(btrim(r.codice))
   and mp.deleted_at is null
  where r.codice ~* '^mp'
    and nullif(btrim(r.codice), '') is not null
    and btrim(r.codice) <> '—'
),
agg_mp as (
  select fornitore_id, array_agg(code order by code) as new_codes
  from invoice_mp
  where code is not null
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
  ),
  tipologie = case
    when 'materia_prima' = any (coalesce(f.tipologie, '{}'::text[])) then f.tipologie
    else coalesce(f.tipologie, '{}'::text[]) || array['materia_prima']
  end,
  updated_at = now()
from agg_mp a
where f.id = a.fornitore_id
  and f.deleted_at is null
  and exists (
    select 1
    from unnest(a.new_codes) as n(code)
    where not (n.code = any (coalesce(f.prodotti_acquistati, '{}'::text[])))
  );

do $$
begin
  raise notice 'Backfill scheda fornitore da fatture ricevute (Sz/Pr/Mp) completato.';
end $$;
