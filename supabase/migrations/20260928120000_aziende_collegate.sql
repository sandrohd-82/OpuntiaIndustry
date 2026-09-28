-- Azienda collegata sotto la stessa anagrafica madre (clienti e possibili clienti).
-- ISO 9001: audit già su created/updated; soft delete invariato; il legame non cancella la figlia.
-- Due schede distinte (timeline propria). P.IVA e CF possono coincidere con la madre
-- oppure essere diversi, ma non duplicare un'altra famiglia.

alter table public.clienti
  add column if not exists azienda_madre_id uuid references public.clienti (id) on delete restrict,
  add column if not exists invia_preventivi boolean not null default true,
  add column if not exists fatturare boolean not null default true,
  add column if not exists invia_campionature boolean not null default true,
  add column if not exists invia_prodotti boolean not null default true,
  add column if not exists tipologia_rispetto_madre text not null default '';

alter table public.clienti_possibili
  add column if not exists azienda_madre_id uuid references public.clienti_possibili (id) on delete restrict,
  add column if not exists invia_preventivi boolean not null default true,
  add column if not exists fatturare boolean not null default true,
  add column if not exists invia_campionature boolean not null default true,
  add column if not exists invia_prodotti boolean not null default true,
  add column if not exists tipologia_rispetto_madre text not null default '';

comment on column public.clienti.azienda_madre_id is
  'Scheda madre. Null = azienda radice. La figlia ha timeline e anagrafica proprie.';
comment on column public.clienti.tipologia_rispetto_madre is
  'Di cosa si occupa la figlia rispetto alla madre. Obbligatoria se azienda_madre_id è valorizzato.';
comment on column public.clienti.invia_preventivi is
  'Se figlia: compare come destinatario consigliato dei preventivi, non obbligatorio.';
comment on column public.clienti.fatturare is
  'Se figlia: compare come destinatario consigliato delle fatture, non obbligatorio.';
comment on column public.clienti.invia_campionature is
  'Se figlia: compare come destinatario consigliato delle campionature, non obbligatorio.';
comment on column public.clienti.invia_prodotti is
  'Se figlia: compare come destinatario consigliato dei prodotti acquistati, non obbligatorio.';

create index if not exists clienti_azienda_madre_idx
  on public.clienti (azienda_madre_id)
  where deleted_at is null and azienda_madre_id is not null;

create index if not exists clienti_possibili_azienda_madre_idx
  on public.clienti_possibili (azienda_madre_id)
  where deleted_at is null and azienda_madre_id is not null;

-- L'univocità globale bloccherebbe la stessa P.IVA nella famiglia. La guardia sotto la sostituisce.
drop index if exists public.clienti_partita_iva_active_uidx;
drop index if exists public.clienti_codice_fiscale_active_uidx;

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
    if madre.is_privato then
      raise exception 'Non si può collegare un''azienda a un cliente privato';
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

drop trigger if exists clienti_azienda_collegata_biu on public.clienti;
create trigger clienti_azienda_collegata_biu
  before insert or update on public.clienti
  for each row execute function public.guard_azienda_collegata_clienti();

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
    if coalesce(madre.is_privato, false) then
      raise exception 'Non si può collegare un''azienda a un privato';
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

drop trigger if exists clienti_possibili_azienda_collegata_biu on public.clienti_possibili;
create trigger clienti_possibili_azienda_collegata_biu
  before insert or update on public.clienti_possibili
  for each row execute function public.guard_azienda_collegata_possibili();
