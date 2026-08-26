-- Prezzo unitario medio Pr/Sz da storico fatture ricevute (ISO 9001)
-- Ct/Mp esclusi (altra logica)

alter table public.catalogo_servizi
  add column if not exists prezzo_unitario_medio numeric(14, 4),
  add column if not exists prezzo_medio_count integer not null default 0,
  add column if not exists prezzo_medio_updated_at timestamptz;

alter table public.catalogo_prodotti_fornitore
  add column if not exists prezzo_unitario_medio numeric(14, 4),
  add column if not exists prezzo_medio_count integer not null default 0,
  add column if not exists prezzo_medio_updated_at timestamptz;

comment on column public.catalogo_servizi.prezzo_unitario_medio is
  'Media aritmetica dei prezzi unitari (listino) da fatture ricevute per questo codice';
comment on column public.catalogo_prodotti_fornitore.prezzo_unitario_medio is
  'Media aritmetica dei prezzi unitari (listino) da fatture ricevute per questo codice';

-- Backfill da righe fatture ricevute non eliminate
with prezzi as (
  select
    lower(trim(r.codice)) as codice_key,
    avg(r.prezzo_unitario)::numeric(14, 4) as medio,
    count(*)::integer as n,
    max(f.data_emissione) as last_dt
  from public.fatture_ricevute_righe r
  inner join public.fatture_ricevute f on f.id = r.fattura_id
  where f.deleted_at is null
    and trim(coalesce(r.codice, '')) <> ''
    and trim(r.codice) <> '—'
    and r.prezzo_unitario is not null
    and r.prezzo_unitario > 0
  group by lower(trim(r.codice))
)
update public.catalogo_servizi s
set
  prezzo_unitario_medio = p.medio,
  prezzo_medio_count = p.n,
  prezzo_medio_updated_at = now()
from prezzi p
where lower(trim(s.codice)) = p.codice_key
  and s.deleted_at is null;

with prezzi as (
  select
    lower(trim(r.codice)) as codice_key,
    avg(r.prezzo_unitario)::numeric(14, 4) as medio,
    count(*)::integer as n
  from public.fatture_ricevute_righe r
  inner join public.fatture_ricevute f on f.id = r.fattura_id
  where f.deleted_at is null
    and trim(coalesce(r.codice, '')) <> ''
    and trim(r.codice) <> '—'
    and r.prezzo_unitario is not null
    and r.prezzo_unitario > 0
  group by lower(trim(r.codice))
)
update public.catalogo_prodotti_fornitore s
set
  prezzo_unitario_medio = p.medio,
  prezzo_medio_count = p.n,
  prezzo_medio_updated_at = now()
from prezzi p
where lower(trim(s.codice)) = p.codice_key
  and s.deleted_at is null;
