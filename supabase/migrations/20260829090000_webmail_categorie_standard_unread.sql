-- Categorie WebMail standard: Preventivi, Ordini, Info, Pubblicità, Generico
-- Colori distinti; rimappa/archivia le vecchie categorie di sistema.

-- 1) Upsert / allinea le 5 categorie standard
insert into public.webmail_categorie (codice, nome, descrizione, colore, is_system, sort_order)
select v.codice, v.nome, v.descrizione, v.colore, true, v.sort_order
from (values
  ('preventivi', 'Preventivi', 'Richieste e invio preventivi / listini', '#16a34a', 10),
  ('ordini', 'Ordini', 'Ordini, lotti e conferme', '#2563eb', 20),
  ('info', 'Info', 'Informazioni generali e schede', '#0891b2', 30),
  ('pubblicita', 'Pubblicità', 'Newsletter e comunicazioni promozionali', '#c026d3', 40),
  ('generico', 'Generico', 'Altre comunicazioni', '#f59e0b', 50)
) as v(codice, nome, descrizione, colore, sort_order)
where not exists (
  select 1 from public.webmail_categorie c
  where lower(c.codice) = lower(v.codice) and c.deleted_at is null
);

update public.webmail_categorie c
set
  nome = v.nome,
  descrizione = v.descrizione,
  colore = v.colore,
  is_system = true,
  sort_order = v.sort_order,
  updated_at = now(),
  deleted_at = null,
  deleted_by = null
from (values
  ('preventivi', 'Preventivi', 'Richieste e invio preventivi / listini', '#16a34a', 10),
  ('ordini', 'Ordini', 'Ordini, lotti e conferme', '#2563eb', 20),
  ('info', 'Info', 'Informazioni generali e schede', '#0891b2', 30),
  ('pubblicita', 'Pubblicità', 'Newsletter e comunicazioni promozionali', '#c026d3', 40),
  ('generico', 'Generico', 'Altre comunicazioni', '#f59e0b', 50)
) as v(codice, nome, descrizione, colore, sort_order)
where lower(c.codice) = lower(v.codice);

-- 2) Remap messaggi dalle vecchie categorie di sistema alle standard
with map as (
  select
    old_c.id as old_id,
    new_c.id as new_id
  from public.webmail_categorie old_c
  join public.webmail_categorie new_c
    on lower(new_c.codice) = case lower(old_c.codice)
      when 'preventivo_listino' then 'preventivi'
      when 'ordine_lotto' then 'ordini'
      when 'scheda_tecnica' then 'info'
      when 'contatti' then 'info'
      when 'da_revisionare' then 'generico'
      when 'scartate' then 'pubblicita'
      else null
    end
  where old_c.deleted_at is null
    and new_c.deleted_at is null
    and lower(old_c.codice) in (
      'preventivo_listino', 'ordine_lotto', 'scheda_tecnica',
      'contatti', 'da_revisionare', 'scartate'
    )
)
update public.webmail_messaggi m
set categoria_id = map.new_id
from map
where m.categoria_id = map.old_id;

update public.webmail_messaggi m
set categoria_suggest_id = map.new_id
from (
  select
    old_c.id as old_id,
    new_c.id as new_id
  from public.webmail_categorie old_c
  join public.webmail_categorie new_c
    on lower(new_c.codice) = case lower(old_c.codice)
      when 'preventivo_listino' then 'preventivi'
      when 'ordine_lotto' then 'ordini'
      when 'scheda_tecnica' then 'info'
      when 'contatti' then 'info'
      when 'da_revisionare' then 'generico'
      when 'scartate' then 'pubblicita'
      else null
    end
  where lower(old_c.codice) in (
    'preventivo_listino', 'ordine_lotto', 'scheda_tecnica',
    'contatti', 'da_revisionare', 'scartate'
  )
) map
where m.categoria_suggest_id = map.old_id;

-- 3) Soft-delete vecchie categorie di sistema sostituite
update public.webmail_categorie
set
  deleted_at = coalesce(deleted_at, now()),
  updated_at = now()
where deleted_at is null
  and is_system = true
  and lower(codice) in (
    'scheda_tecnica',
    'preventivo_listino',
    'ordine_lotto',
    'contatti',
    'da_revisionare',
    'scartate'
  );

-- 4) Assicura colori distinti sulle categorie custom residue (se coincidono con standard)
-- Palette di riserva per collisioni
with palette as (
  select unnest(array[
    '#dc2626', '#ea580c', '#65a30d', '#0d9488', '#7c3aed',
    '#db2777', '#0284c7', '#4f46e5', '#a16207', '#475569'
  ]) as colore
),
used as (
  select lower(colore) as colore
  from public.webmail_categorie
  where deleted_at is null
),
dupes as (
  select c.id, c.colore,
    row_number() over (partition by lower(c.colore) order by c.is_system desc, c.sort_order, c.created_at) as rn
  from public.webmail_categorie c
  where c.deleted_at is null
),
to_fix as (
  select d.id,
    (
      select p.colore
      from palette p
      where lower(p.colore) not in (select colore from used)
      and lower(p.colore) not in (
        select lower(c2.colore)
        from public.webmail_categorie c2
        where c2.deleted_at is null and c2.id <> d.id
      )
      limit 1
    ) as new_colore
  from dupes d
  where d.rn > 1
)
update public.webmail_categorie c
set colore = t.new_colore, updated_at = now()
from to_fix t
where c.id = t.id and t.new_colore is not null;

comment on table public.webmail_categorie is
  'Categorie WebMail — standard: Preventivi, Ordini, Info, Pubblicità, Generico (colori distinti)';
