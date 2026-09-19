-- Oggetti importati = entità del foglio destinazione, non della madre.
-- Univocità codice per foglio di origine, non per luogo.

drop index if exists public.mag_ubic_luogo_codice_uidx;
drop index if exists public.mag_ubic_mappa_codice_uidx;

create unique index if not exists mag_ubic_origine_codice_uidx
  on public.magazzino_ubicazioni (mappa_origine_id, lower(codice))
  where deleted_at is null and mappa_origine_id is not null;

comment on index public.mag_ubic_origine_codice_uidx is
  'Stesso codice (es. A1) può esistere su fogli diversi: ogni foglio ha i suoi posti.';

do $$
declare
  r record;
  nid uuid;
begin
  create temporary table if not exists mag_ubi_clone_map (
    mappa_id uuid not null,
    old_id uuid not null,
    new_id uuid not null
  ) on commit drop;

  for r in
    select distinct
      a.mappa_id,
      a.ubicazione_id,
      u.codice,
      u.nome,
      u.parent_id,
      u.luogo_nome,
      u.tipo
    from public.magazzino_mappa_aree a
    join public.magazzino_ubicazioni u on u.id = a.ubicazione_id
    where a.deleted_at is null
      and u.deleted_at is null
      and u.mappa_origine_id is distinct from a.mappa_id
  loop
    select u.id
      into nid
    from public.magazzino_ubicazioni u
    where u.deleted_at is null
      and u.mappa_origine_id = r.mappa_id
      and lower(u.codice) = lower(r.codice)
    limit 1;

    if nid is null then
      insert into public.magazzino_ubicazioni (
        codice,
        nome,
        parent_id,
        tipo,
        luogo_nome,
        mappa_origine_id,
        documento_stato,
        versione
      )
      values (
        r.codice,
        r.nome,
        r.parent_id,
        coalesce(r.tipo, 'riponibile'),
        coalesce(r.luogo_nome, ''),
        r.mappa_id,
        'bozza',
        1
      )
      returning id into nid;
    end if;

    insert into mag_ubi_clone_map (mappa_id, old_id, new_id)
    values (r.mappa_id, r.ubicazione_id, nid);
  end loop;

  update public.magazzino_ubicazioni u
  set parent_id = m.new_id,
      updated_at = now()
  from mag_ubi_clone_map c,
       mag_ubi_clone_map m
  where u.id = c.new_id
    and u.deleted_at is null
    and m.mappa_id = c.mappa_id
    and m.old_id = u.parent_id;

  -- Figli già di questo foglio che puntavano al posto condiviso con la madre.
  update public.magazzino_ubicazioni u
  set parent_id = c.new_id,
      updated_at = now()
  from mag_ubi_clone_map c
  where u.deleted_at is null
    and u.mappa_origine_id = c.mappa_id
    and u.parent_id = c.old_id;

  -- I cloni importati non tengono il parent della madre.
  update public.magazzino_ubicazioni u
  set parent_id = null,
      updated_at = now()
  from mag_ubi_clone_map c
  where u.id = c.new_id
    and u.deleted_at is null
    and u.parent_id is not null
    and not exists (
      select 1
      from public.magazzino_ubicazioni p
      where p.id = u.parent_id
        and p.deleted_at is null
        and p.mappa_origine_id = u.mappa_origine_id
    );

  update public.magazzino_mappa_aree a
  set
    ubicazione_id = c.new_id,
    updated_at = now()
  from mag_ubi_clone_map c
  where a.deleted_at is null
    and a.mappa_id = c.mappa_id
    and a.ubicazione_id = c.old_id;
end $$;
