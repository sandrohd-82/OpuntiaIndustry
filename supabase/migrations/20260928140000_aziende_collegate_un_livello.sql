-- Un solo livello: una scheda che ha già figlie non può diventare figlia.
-- Un privato non può stare sotto un'azienda madre.

create or replace function public.guard_azienda_collegata_clienti()
returns trigger
language plpgsql
as $$
declare
  madre public.clienti%rowtype;
  clash_targa text;
  clash_nome text;
  root_id uuid;
  root_value text;
begin
  if new.deleted_at is not null then
    return new;
  end if;

  if new.azienda_madre_id is not null then
    if new.azienda_madre_id = new.id then
      raise exception 'Un''azienda non può essere collegata a se stessa';
    end if;
    select * into madre
    from public.clienti
    where id = new.azienda_madre_id and deleted_at is null;
    if not found then
      raise exception 'Azienda madre non trovata o archiviata';
    end if;
    if madre.azienda_madre_id is not null then
      raise exception 'Si collega solo un''azienda madre, non una scheda già collegata';
    end if;
    if madre.is_privato or coalesce(new.is_privato, false) then
      raise exception 'Non si può collegare un privato sotto un''azienda';
    end if;
    if exists (
      select 1
      from public.clienti f
      where f.deleted_at is null
        and f.azienda_madre_id = new.id
    ) then
      raise exception 'Questa azienda ha già schede collegate e può restare solo madre';
    end if;
    if char_length(trim(coalesce(new.tipologia_rispetto_madre, ''))) < 1 then
      raise exception 'Indica di cosa si occupa l''azienda rispetto alla madre';
    end if;
    root_id := new.azienda_madre_id;
  else
    root_id := new.id;
  end if;

  if trim(coalesce(new.partita_iva, '')) <> '' then
    if new.azienda_madre_id is null then
      root_value := lower(trim(new.partita_iva));
    else
      root_value := lower(trim(madre.partita_iva));
    end if;
    select o.codice_targa, o.ragione_sociale
      into clash_targa, clash_nome
    from public.clienti o
    where o.deleted_at is null
      and o.id is distinct from new.id
      and lower(trim(o.partita_iva)) = lower(trim(new.partita_iva))
      and not (
        lower(trim(new.partita_iva)) = root_value
        and coalesce(o.azienda_madre_id, o.id) = root_id
      )
    limit 1;
    if clash_targa is not null then
      raise exception 'P. IVA già presente su % — %', clash_targa, clash_nome;
    end if;
  end if;

  if trim(coalesce(new.codice_fiscale, '')) <> '' then
    if new.azienda_madre_id is null then
      root_value := lower(trim(new.codice_fiscale));
    else
      root_value := lower(trim(madre.codice_fiscale));
    end if;
    select o.codice_targa, o.ragione_sociale
      into clash_targa, clash_nome
    from public.clienti o
    where o.deleted_at is null
      and o.id is distinct from new.id
      and lower(trim(o.codice_fiscale)) = lower(trim(new.codice_fiscale))
      and not (
        lower(trim(new.codice_fiscale)) = root_value
        and coalesce(o.azienda_madre_id, o.id) = root_id
      )
    limit 1;
    if clash_targa is not null then
      raise exception 'Codice fiscale già presente su % — %', clash_targa, clash_nome;
    end if;
  end if;

  return new;
end;
$$;

create or replace function public.guard_azienda_collegata_possibili()
returns trigger
language plpgsql
as $$
declare
  madre public.clienti_possibili%rowtype;
  clash_nome text;
  root_id uuid;
  root_value text;
begin
  if new.deleted_at is not null then
    return new;
  end if;

  if new.azienda_madre_id is not null then
    if new.azienda_madre_id = new.id then
      raise exception 'Un''azienda non può essere collegata a se stessa';
    end if;
    select * into madre
    from public.clienti_possibili
    where id = new.azienda_madre_id and deleted_at is null;
    if not found then
      raise exception 'Azienda madre non trovata o archiviata';
    end if;
    if madre.azienda_madre_id is not null then
      raise exception 'Si collega solo un''azienda madre, non una scheda già collegata';
    end if;
    if coalesce(madre.is_privato, false) or coalesce(new.is_privato, false) then
      raise exception 'Non si può collegare un privato sotto un''azienda';
    end if;
    if exists (
      select 1
      from public.clienti_possibili f
      where f.deleted_at is null
        and f.azienda_madre_id = new.id
    ) then
      raise exception 'Questa azienda ha già schede collegate e può restare solo madre';
    end if;
    if char_length(trim(coalesce(new.tipologia_rispetto_madre, ''))) < 1 then
      raise exception 'Indica di cosa si occupa l''azienda rispetto alla madre';
    end if;
    root_id := new.azienda_madre_id;
  else
    root_id := new.id;
  end if;

  if trim(coalesce(new.partita_iva, '')) <> '' then
    if new.azienda_madre_id is null then
      root_value := lower(trim(new.partita_iva));
    else
      root_value := lower(trim(madre.partita_iva));
    end if;
    select o.ragione_sociale into clash_nome
    from public.clienti_possibili o
    where o.deleted_at is null
      and o.id is distinct from new.id
      and lower(trim(o.partita_iva)) = lower(trim(new.partita_iva))
      and not (
        lower(trim(new.partita_iva)) = root_value
        and coalesce(o.azienda_madre_id, o.id) = root_id
      )
    limit 1;
    if clash_nome is not null then
      raise exception 'P. IVA già presente sul possibile cliente %', clash_nome;
    end if;
  end if;

  if trim(coalesce(new.codice_fiscale, '')) <> '' then
    if new.azienda_madre_id is null then
      root_value := lower(trim(new.codice_fiscale));
    else
      root_value := lower(trim(madre.codice_fiscale));
    end if;
    select o.ragione_sociale into clash_nome
    from public.clienti_possibili o
    where o.deleted_at is null
      and o.id is distinct from new.id
      and lower(trim(o.codice_fiscale)) = lower(trim(new.codice_fiscale))
      and not (
        lower(trim(new.codice_fiscale)) = root_value
        and coalesce(o.azienda_madre_id, o.id) = root_id
      )
    limit 1;
    if clash_nome is not null then
      raise exception 'Codice fiscale già presente sul possibile cliente %', clash_nome;
    end if;
  end if;

  return new;
end;
$$;
