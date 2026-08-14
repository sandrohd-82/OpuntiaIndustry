-- Libera targhe Fxxx bloccate da soft-delete senza attività / registrazioni vuote.
-- Unique targa solo su schede ATTIVE; soft-delete con attività restano in sequenza via app/DB gen.

-- ---------------------------------------------------------------------------
-- 1) Soft-delete SENZA materie bio → archivio + DELETE fisico (libera targa)
-- ---------------------------------------------------------------------------
with candidati as (
  select f.*
  from public.fornitori f
  where f.deleted_at is not null
    and not exists (
      select 1
      from public.materie_prime m
      where m.fornitore_bio_id = f.id
        and m.deleted_at is null
    )
),
_ins as (
  insert into public.fornitori_archivio (
    partita_iva, ragione_sociale, motivo, note, snapshot, created_by, updated_by
  )
  select
    coalesce(c.partita_iva, ''),
    coalesce(nullif(trim(c.ragione_sociale), ''), '(scheda soft-delete)'),
    'pulizia',
    format('Pulizia targa %s: soft-delete senza attività', c.codice_targa),
    (
      to_jsonb(c) - 'codice_targa' - 'id' - 'deleted_at' - 'deleted_by'
      - 'created_at' - 'updated_at' - 'created_by' - 'updated_by'
    ),
    c.deleted_by,
    c.deleted_by
  from candidati c
  returning 1
)
delete from public.fornitori f
where f.id in (select id from candidati);

-- ---------------------------------------------------------------------------
-- 2) Attive vuote (no ragione sociale + no P.IVA) → archivio + DELETE
-- ---------------------------------------------------------------------------
with vuoti as (
  select f.*
  from public.fornitori f
  where f.deleted_at is null
    and trim(coalesce(f.ragione_sociale, '')) = ''
    and trim(coalesce(f.partita_iva, '')) = ''
    and not exists (
      select 1
      from public.materie_prime m
      where m.fornitore_bio_id = f.id
        and m.deleted_at is null
    )
),
_ins as (
  insert into public.fornitori_archivio (
    partita_iva, ragione_sociale, motivo, note, snapshot, created_by, updated_by
  )
  select
    '',
    '(registrazione vuota)',
    'pulizia',
    format('Rimossa registrazione vuota targa %s', c.codice_targa),
    (
      to_jsonb(c) - 'codice_targa' - 'id' - 'deleted_at' - 'deleted_by'
      - 'created_at' - 'updated_at' - 'created_by' - 'updated_by'
    ),
    c.created_by,
    c.updated_by
  from vuoti c
  returning 1
)
delete from public.fornitori f
where f.id in (select id from vuoti);

-- ---------------------------------------------------------------------------
-- 3) Unique targa solo su ATTIVE (soft-delete non blocca più l’indice)
-- ---------------------------------------------------------------------------
alter table public.fornitori
  drop constraint if exists fornitori_codice_targa_key;

drop index if exists public.fornitori_codice_targa_key;
drop index if exists public.fornitori_codice_targa_uidx;
drop index if exists public.fornitori_codice_targa_active_uidx;

create unique index if not exists fornitori_codice_targa_active_uidx
  on public.fornitori (upper(codice_targa))
  where deleted_at is null;

comment on index public.fornitori_codice_targa_active_uidx is
  'Targa univoca solo tra fornitori attivi; soft-delete non occupa l’indice';

-- ---------------------------------------------------------------------------
-- 4) Generatore: salta attive + soft-delete con materie bio (targa “impegnata”)
-- ---------------------------------------------------------------------------
create or replace function public.generate_codice_targa_fornitore()
returns text
language plpgsql
as $$
declare
  alphabet constant text := '0123456789ABCDEF';
  idx int;
  body text;
  candidate text;
  n int;
  digit int;
  i int;
begin
  for idx in 1..4095 loop
    n := idx;
    body := '';
    for i in 1..3 loop
      digit := n % 16;
      body := substr(alphabet, digit + 1, 1) || body;
      n := n / 16;
    end loop;

    candidate := 'F' || body;

    if not exists (
      select 1
      from public.fornitori f
      where upper(f.codice_targa) = candidate
        and (
          f.deleted_at is null
          or exists (
            select 1
            from public.materie_prime m
            where m.fornitore_bio_id = f.id
              and m.deleted_at is null
          )
        )
    ) then
      return candidate;
    end if;
  end loop;

  raise exception 'Impossibile generare un codice targa fornitore univoco';
end;
$$;

comment on function public.generate_codice_targa_fornitore() is
  'Prossima targa F001–FFFF: esclude attive e soft-delete con attività bio.';
