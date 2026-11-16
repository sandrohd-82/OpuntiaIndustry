-- Ordini di approvvigionamento materie prime.
-- Separati dagli ordini commerciali. Solo bozze.
-- Non pubblica, non invia mail, non apre fogli HACCP e non assegna unità ai materiali esistenti.

alter table public.materie_prime
  add column if not exists unita_misura text;

do $$
begin
  if not exists (
    select 1 from pg_constraint where conname = 'materie_prime_unita_check'
  ) then
    alter table public.materie_prime
      add constraint materie_prime_unita_check
      check (
        unita_misura is null
        or unita_misura in ('kg', 'g', 'lt', 'ml', 'pz')
      );
  end if;
end $$;

comment on column public.materie_prime.unita_misura is
  'Unità del catalogo. Resta vuota finché non la imposta Amministrazione. Gli ordini non ne inventano una.';

drop policy if exists "materie_prime_select_produzione" on public.materie_prime;
create policy "materie_prime_select_produzione"
  on public.materie_prime for select
  to authenticated
  using (
    public.has_area_access('produzione')
    and deleted_at is null
  );

create sequence if not exists public.approvvigionamenti_codice_seq;

create table if not exists public.approvvigionamenti_operazioni (
  id uuid primary key default gen_random_uuid(),
  chiave text not null,
  tipo text not null check (tipo in ('crea', 'aggiorna', 'copia', 'settimana', 'piano')),
  created_at timestamptz not null default now(),
  created_by uuid
);

create unique index if not exists approvvigionamenti_operazioni_chiave_uidx
  on public.approvvigionamenti_operazioni (chiave);

create table if not exists public.approvvigionamenti_ordini (
  id uuid primary key default gen_random_uuid(),
  codice text not null,
  fornitore_id uuid not null references public.fornitori (id),
  data_consegna date not null,
  note text not null default '',
  stato text not null default 'bozza' check (stato = 'bozza'),
  origine_ordine_id uuid,
  pubblicato_at timestamptz,
  versione_pubblicata integer,
  presa_visione_at timestamptz,
  foglio_ingresso_id uuid,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  created_by uuid,
  updated_by uuid,
  deleted_at timestamptz,
  deleted_by uuid
);

create unique index if not exists approvvigionamenti_ordini_codice_uidx
  on public.approvvigionamenti_ordini (codice)
  where deleted_at is null;

create index if not exists approvvigionamenti_ordini_data_idx
  on public.approvvigionamenti_ordini (data_consegna)
  where deleted_at is null;

comment on table public.approvvigionamenti_ordini is
  'Bozze di approvvigionamento. Pubblicazione, versione immutabile, presa visione e carico HACCP sono colonne pronte e restano vuote.';

create table if not exists public.approvvigionamenti_righe (
  id uuid primary key default gen_random_uuid(),
  ordine_id uuid not null references public.approvvigionamenti_ordini (id),
  materia_prima_id uuid not null references public.materie_prime (id),
  quantita numeric not null check (quantita > 0),
  unita_misura text not null,
  note text not null default '',
  sort_order integer not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  created_by uuid,
  updated_by uuid,
  deleted_at timestamptz,
  deleted_by uuid
);

do $$
begin
  if not exists (
    select 1 from pg_constraint where conname = 'approvvigionamenti_righe_unita_check'
  ) then
    alter table public.approvvigionamenti_righe
      add constraint approvvigionamenti_righe_unita_check
      check (unita_misura in ('kg', 'g', 'lt', 'ml', 'pz'));
  end if;
end $$;

create table if not exists public.approvvigionamenti_operazioni_ordini (
  operazione_id uuid not null references public.approvvigionamenti_operazioni (id),
  ordine_id uuid not null references public.approvvigionamenti_ordini (id),
  primary key (operazione_id, ordine_id)
);

drop trigger if exists approvvigionamenti_ordini_updated_at on public.approvvigionamenti_ordini;
create trigger approvvigionamenti_ordini_updated_at
  before update on public.approvvigionamenti_ordini
  for each row execute function public.set_updated_at();

drop trigger if exists approvvigionamenti_righe_updated_at on public.approvvigionamenti_righe;
create trigger approvvigionamenti_righe_updated_at
  before update on public.approvvigionamenti_righe
  for each row execute function public.set_updated_at();

create or replace function public.approvvigionamenti_solo_bozza()
returns trigger
language plpgsql
as $$
begin
  if new.stato is distinct from 'bozza'
     or new.pubblicato_at is not null
     or new.versione_pubblicata is not null
     or new.presa_visione_at is not null
     or new.foglio_ingresso_id is not null
  then
    raise exception 'Pubblicazione, presa visione e collegamento al carico non sono attivi';
  end if;
  return new;
end;
$$;

drop trigger if exists approvvigionamenti_ordini_solo_bozza on public.approvvigionamenti_ordini;
create trigger approvvigionamenti_ordini_solo_bozza
  before insert or update on public.approvvigionamenti_ordini
  for each row execute function public.approvvigionamenti_solo_bozza();

create or replace function public.approvvigionamento_entro_validita(
  p_at timestamptz,
  p_giorni integer
)
returns boolean
language sql
stable
as $$
  select p_at is not null
    and (p_giorni is null or p_at + make_interval(days => p_giorni) >= now());
$$;

create or replace function public.requisito_approvvigionamento_soddisfatto(
  p_fornitore uuid,
  p_requisito uuid
)
returns boolean
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_natura text;
  v_giorni integer;
  v_linea uuid;
  v_versione uuid;
  v_at timestamptz;
  v_esito text;
begin
  select natura, validita_giorni, linea_guida_id
    into v_natura, v_giorni, v_linea
  from public.fornitori_requisiti
  where id = p_requisito
    and deleted_at is null;
  if v_natura is null then
    return false;
  end if;

  if v_natura = 'controllo_interno' then
    select esito, registrata_at
      into v_esito, v_at
    from public.fornitori_controlli_interni
    where requisito_id = p_requisito
      and fornitore_id = p_fornitore
    order by registrata_at desc
    limit 1;
    if v_esito is distinct from 'conforme' then
      return false;
    end if;
    return public.approvvigionamento_entro_validita(v_at, v_giorni);
  end if;

  if v_natura = 'presa_visione' then
    select v.id
      into v_versione
    from public.haccp_linee_guida_versioni v
    where v.documento_id = v_linea
      and v.stato = 'pubblicata'
      and v.deleted_at is null
    order by v.numero desc
    limit 1;
    if v_versione is null then
      return false;
    end if;
    if not exists (
      select 1
      from public.haccp_linee_guida_distribuzioni d
      where d.versione_id = v_versione
        and d.fornitore_id = p_fornitore
        and d.deleted_at is null
        and d.stato = 'registrata'
    ) then
      return false;
    end if;
    select max(confermata_at)
      into v_at
    from public.haccp_linee_guida_prese_visione
    where versione_id = v_versione
      and fornitore_id = p_fornitore;
    return public.approvvigionamento_entro_validita(v_at, v_giorni);
  end if;

  select v.id
    into v_versione
  from public.fornitori_testi_abilitazione t
  join public.fornitori_testi_versioni v on v.testo_id = t.id
  where t.requisito_id = p_requisito
    and t.deleted_at is null
    and v.stato = 'pubblicata'
    and v.deleted_at is null
  order by v.numero desc
  limit 1;
  if v_versione is null then
    return false;
  end if;
  if not exists (
    select 1
    from public.fornitori_testi_distribuzioni d
    where d.versione_id = v_versione
      and d.fornitore_id = p_fornitore
      and d.deleted_at is null
  ) then
    return false;
  end if;
  select max(a.confermata_at)
    into v_at
  from public.fornitori_testi_atti a
  where a.versione_id = v_versione
    and a.fornitore_id = p_fornitore
    and a.atto = v_natura;
  return public.approvvigionamento_entro_validita(v_at, v_giorni);
end;
$$;

create or replace function public.fornitore_assegnabile_approvvigionamento(
  p_fornitore uuid,
  p_materie uuid[]
)
returns text
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_tipologie text[];
  v_codici text[];
  v_evento text;
  v_requisito uuid;
  v_materie uuid[];
begin
  select coalesce(array_agg(distinct x), array[]::uuid[])
    into v_materie
  from unnest(coalesce(p_materie, array[]::uuid[])) as x;
  if cardinality(v_materie) = 0 then
    return 'Serve almeno una materia prima.';
  end if;

  select tipologie, prodotti_acquistati
    into v_tipologie, v_codici
  from public.fornitori
  where id = p_fornitore
    and deleted_at is null;
  if v_tipologie is null then
    return 'Fornitore non trovato.';
  end if;
  if not ('materia_prima' = any(v_tipologie)) then
    return 'Il fornitore non è di materia prima.';
  end if;

  select e.tipo
    into v_evento
  from public.fornitori_abilitazione_eventi e
  where e.fornitore_id = p_fornitore
  order by e.created_at desc
  limit 1;
  if v_evento = 'sospensione' then
    return 'Il fornitore è sospeso.';
  end if;

  if exists (
    select 1
    from public.materie_prime m
    where m.id = any(v_materie)
      and m.deleted_at is null
      and not (m.codice = any(coalesce(v_codici, array[]::text[])))
  ) then
    return 'Il fornitore non tratta tutte le materie scelte.';
  end if;

  if (
    select count(*)
    from public.materie_prime m
    where m.id = any(v_materie)
      and m.deleted_at is null
  ) <> cardinality(v_materie) then
    return 'Materia prima non disponibile.';
  end if;

  for v_requisito in
    select r.id
    from public.fornitori_requisiti r
    where r.deleted_at is null
      and not exists (
        select 1
        from public.fornitori_requisiti_eccezioni e
        where e.requisito_id = r.id
          and e.fornitore_id = p_fornitore
          and e.deleted_at is null
          and e.modalita = 'escluso'
      )
      and (
        exists (
          select 1
          from public.fornitori_requisiti_eccezioni e
          where e.requisito_id = r.id
            and e.fornitore_id = p_fornitore
            and e.deleted_at is null
            and e.modalita = 'aggiunto'
        )
        or exists (
          select 1
          from public.fornitori_requisiti_tipologie t
          where t.requisito_id = r.id
            and t.tipologia = any(v_tipologie)
        )
      )
  loop
    if not public.requisito_approvvigionamento_soddisfatto(p_fornitore, v_requisito) then
      return 'Il fornitore non è abilitato.';
    end if;
  end loop;

  return 'ok';
end;
$$;

create or replace function public.approvvigionamento_autorizzato()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select public.is_superadmin()
    or public.has_area_access('produzione')
    or public.has_area_access('amministrazione');
$$;

create or replace function public.registra_approvvigionamenti(
  p_chiave text,
  p_tipo text,
  p_ordini jsonb
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_operazione uuid;
  v_ordine jsonb;
  v_riga jsonb;
  v_ordine_id uuid;
  v_fornitore uuid;
  v_materie uuid[];
  v_esito text;
  v_unita text;
  v_unita_catalogo text;
  v_ids uuid[] := array[]::uuid[];
begin
  if not public.approvvigionamento_autorizzato() then
    raise exception 'Non autorizzato a registrare gli approvvigionamenti';
  end if;
  if p_chiave is null or length(btrim(p_chiave)) < 8 then
    raise exception 'Chiave operazione non valida';
  end if;
  if p_tipo not in ('crea', 'copia', 'settimana', 'piano') then
    raise exception 'Tipo operazione non valido';
  end if;
  if jsonb_typeof(p_ordini) <> 'array' or jsonb_array_length(p_ordini) = 0 then
    raise exception 'Nessun ordine da registrare';
  end if;

  insert into public.approvvigionamenti_operazioni (chiave, tipo, created_by)
  values (p_chiave, p_tipo, public.app_effective_uid())
  on conflict (chiave) do nothing
  returning id into v_operazione;

  if v_operazione is null then
    return (
      select jsonb_build_object(
        'riusata', true,
        'ordini', coalesce(jsonb_agg(jsonb_build_object(
          'id', o.id,
          'codice', o.codice,
          'dataConsegna', o.data_consegna
        ) order by o.data_consegna, o.codice), '[]'::jsonb)
      )
      from public.approvvigionamenti_operazioni op
      join public.approvvigionamenti_operazioni_ordini l on l.operazione_id = op.id
      join public.approvvigionamenti_ordini o on o.id = l.ordine_id
      where op.chiave = p_chiave
        and o.deleted_at is null
    );
  end if;

  for v_ordine in select value from jsonb_array_elements(p_ordini)
  loop
    v_fornitore := (v_ordine->>'fornitoreId')::uuid;
    select coalesce(array_agg((riga->>'materiaPrimaId')::uuid), array[]::uuid[])
      into v_materie
    from jsonb_array_elements(coalesce(v_ordine->'righe', '[]'::jsonb)) riga;
    v_esito := public.fornitore_assegnabile_approvvigionamento(v_fornitore, v_materie);
    if v_esito <> 'ok' then
      raise exception '%', v_esito;
    end if;

    for v_riga in select value from jsonb_array_elements(v_ordine->'righe')
    loop
      if (v_riga->>'quantita')::numeric <= 0 then
        raise exception 'La quantità deve essere positiva';
      end if;
      select m.unita_misura
        into v_unita_catalogo
      from public.materie_prime m
      where m.id = (v_riga->>'materiaPrimaId')::uuid
        and m.deleted_at is null;
      v_unita := v_riga->>'unitaMisura';
      if v_unita_catalogo is null then
        raise exception 'La materia prima non ha un''unità di misura in catalogo';
      end if;
      if v_unita is distinct from v_unita_catalogo then
        raise exception 'L''unità non coincide con il catalogo';
      end if;
    end loop;

    insert into public.approvvigionamenti_ordini (
      codice, fornitore_id, data_consegna, note, stato, origine_ordine_id,
      created_by, updated_by
    )
    values (
      'AP-' || to_char(current_date, 'YY') || '-' || lpad(nextval('public.approvvigionamenti_codice_seq')::text, 4, '0'),
      v_fornitore,
      (v_ordine->>'dataConsegna')::date,
      left(coalesce(v_ordine->>'note', ''), 2000),
      'bozza',
      nullif(v_ordine->>'origineOrdineId', '')::uuid,
      public.app_effective_uid(),
      public.app_effective_uid()
    )
    returning id into v_ordine_id;

    insert into public.approvvigionamenti_righe (
      ordine_id, materia_prima_id, quantita, unita_misura, note, sort_order,
      created_by, updated_by
    )
    select
      v_ordine_id,
      (riga->>'materiaPrimaId')::uuid,
      (riga->>'quantita')::numeric,
      riga->>'unitaMisura',
      left(coalesce(riga->>'note', ''), 500),
      ordinality::integer - 1,
      public.app_effective_uid(),
      public.app_effective_uid()
    from jsonb_array_elements(v_ordine->'righe') with ordinality as t(riga, ordinality);

    insert into public.approvvigionamenti_operazioni_ordini (operazione_id, ordine_id)
    values (v_operazione, v_ordine_id);
    v_ids := array_append(v_ids, v_ordine_id);
  end loop;

  return (
    select jsonb_build_object(
      'riusata', false,
      'ordini', coalesce(jsonb_agg(jsonb_build_object(
        'id', o.id,
        'codice', o.codice,
        'dataConsegna', o.data_consegna
      ) order by o.data_consegna, o.codice), '[]'::jsonb)
    )
    from public.approvvigionamenti_ordini o
    where o.id = any(v_ids)
  );
end;
$$;

create or replace function public.aggiorna_approvvigionamento(
  p_chiave text,
  p_ordine_id uuid,
  p_ordine jsonb
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_operazione uuid;
  v_fornitore uuid;
  v_materie uuid[];
  v_esito text;
  v_riga jsonb;
  v_unita text;
  v_unita_catalogo text;
begin
  if not public.approvvigionamento_autorizzato() then
    raise exception 'Non autorizzato a registrare gli approvvigionamenti';
  end if;
  if p_chiave is null or length(btrim(p_chiave)) < 8 then
    raise exception 'Chiave operazione non valida';
  end if;
  if not exists (
    select 1 from public.approvvigionamenti_ordini
    where id = p_ordine_id and deleted_at is null and stato = 'bozza'
  ) then
    raise exception 'Ordine non trovato';
  end if;

  insert into public.approvvigionamenti_operazioni (chiave, tipo, created_by)
  values (p_chiave, 'aggiorna', public.app_effective_uid())
  on conflict (chiave) do nothing
  returning id into v_operazione;

  if v_operazione is null then
    return jsonb_build_object('riusata', true, 'id', p_ordine_id);
  end if;

  v_fornitore := (p_ordine->>'fornitoreId')::uuid;
  select coalesce(array_agg((riga->>'materiaPrimaId')::uuid), array[]::uuid[])
    into v_materie
  from jsonb_array_elements(coalesce(p_ordine->'righe', '[]'::jsonb)) riga;
  v_esito := public.fornitore_assegnabile_approvvigionamento(v_fornitore, v_materie);
  if v_esito <> 'ok' then
    raise exception '%', v_esito;
  end if;

  for v_riga in select value from jsonb_array_elements(p_ordine->'righe')
  loop
    if (v_riga->>'quantita')::numeric <= 0 then
      raise exception 'La quantità deve essere positiva';
    end if;
    select m.unita_misura into v_unita_catalogo
    from public.materie_prime m
    where m.id = (v_riga->>'materiaPrimaId')::uuid
      and m.deleted_at is null;
    v_unita := v_riga->>'unitaMisura';
    if v_unita_catalogo is null then
      raise exception 'La materia prima non ha un''unità di misura in catalogo';
    end if;
    if v_unita is distinct from v_unita_catalogo then
      raise exception 'L''unità non coincide con il catalogo';
    end if;
  end loop;

  update public.approvvigionamenti_ordini
  set fornitore_id = v_fornitore,
      data_consegna = (p_ordine->>'dataConsegna')::date,
      note = left(coalesce(p_ordine->>'note', ''), 2000),
      updated_by = public.app_effective_uid()
  where id = p_ordine_id
    and deleted_at is null;

  update public.approvvigionamenti_righe
  set deleted_at = now(),
      deleted_by = public.app_effective_uid()
  where ordine_id = p_ordine_id
    and deleted_at is null;

  insert into public.approvvigionamenti_righe (
    ordine_id, materia_prima_id, quantita, unita_misura, note, sort_order,
    created_by, updated_by
  )
  select
    p_ordine_id,
    (riga->>'materiaPrimaId')::uuid,
    (riga->>'quantita')::numeric,
    riga->>'unitaMisura',
    left(coalesce(riga->>'note', ''), 500),
    ordinality::integer - 1,
    public.app_effective_uid(),
    public.app_effective_uid()
  from jsonb_array_elements(p_ordine->'righe') with ordinality as t(riga, ordinality);

  insert into public.approvvigionamenti_operazioni_ordini (operazione_id, ordine_id)
  values (v_operazione, p_ordine_id);

  return jsonb_build_object('riusata', false, 'id', p_ordine_id);
end;
$$;

alter table public.approvvigionamenti_operazioni enable row level security;
alter table public.approvvigionamenti_ordini enable row level security;
alter table public.approvvigionamenti_righe enable row level security;
alter table public.approvvigionamenti_operazioni_ordini enable row level security;

drop policy if exists "approvvigionamenti_ordini_select" on public.approvvigionamenti_ordini;
create policy "approvvigionamenti_ordini_select"
  on public.approvvigionamenti_ordini for select to authenticated
  using (public.approvvigionamento_autorizzato());

drop policy if exists "approvvigionamenti_righe_select" on public.approvvigionamenti_righe;
create policy "approvvigionamenti_righe_select"
  on public.approvvigionamenti_righe for select to authenticated
  using (public.approvvigionamento_autorizzato());

drop policy if exists "approvvigionamenti_operazioni_select" on public.approvvigionamenti_operazioni;
create policy "approvvigionamenti_operazioni_select"
  on public.approvvigionamenti_operazioni for select to authenticated
  using (public.approvvigionamento_autorizzato());

drop policy if exists "approvvigionamenti_operazioni_ordini_select" on public.approvvigionamenti_operazioni_ordini;
create policy "approvvigionamenti_operazioni_ordini_select"
  on public.approvvigionamenti_operazioni_ordini for select to authenticated
  using (public.approvvigionamento_autorizzato());

revoke all on table public.approvvigionamenti_operazioni from public, anon, authenticated;
revoke all on table public.approvvigionamenti_ordini from public, anon, authenticated;
revoke all on table public.approvvigionamenti_righe from public, anon, authenticated;
revoke all on table public.approvvigionamenti_operazioni_ordini from public, anon, authenticated;
grant select on public.approvvigionamenti_operazioni to authenticated;
grant select on public.approvvigionamenti_ordini to authenticated;
grant select on public.approvvigionamenti_righe to authenticated;
grant select on public.approvvigionamenti_operazioni_ordini to authenticated;
revoke all on sequence public.approvvigionamenti_codice_seq from public, anon, authenticated;

create or replace function public.fornitori_compatibili_approvvigionamento(p_materie uuid[])
returns table (
  id uuid,
  ragione_sociale text,
  codice_targa text
)
language plpgsql
stable
security definer
set search_path = public
as $$
begin
  if not public.approvvigionamento_autorizzato() then
    raise exception 'Non autorizzato';
  end if;
  return query
  select f.id, f.ragione_sociale, f.codice_targa
  from public.fornitori f
  where f.deleted_at is null
    and public.fornitore_assegnabile_approvvigionamento(f.id, p_materie) = 'ok'
  order by f.ragione_sociale;
end;
$$;

revoke all on function public.fornitori_compatibili_approvvigionamento(uuid[]) from public, anon;
grant execute on function public.fornitori_compatibili_approvvigionamento(uuid[]) to authenticated;

revoke all on function public.registra_approvvigionamenti(text, text, jsonb) from public, anon;
revoke all on function public.aggiorna_approvvigionamento(text, uuid, jsonb) from public, anon;
grant execute on function public.registra_approvvigionamenti(text, text, jsonb) to authenticated;
grant execute on function public.aggiorna_approvvigionamento(text, uuid, jsonb) to authenticated;
revoke all on function public.fornitore_assegnabile_approvvigionamento(uuid, uuid[]) from public, anon, authenticated;
revoke all on function public.approvvigionamenti_solo_bozza() from public, anon, authenticated;
revoke all on function public.approvvigionamento_entro_validita(timestamptz, integer) from public, anon, authenticated;
revoke all on function public.requisito_approvvigionamento_soddisfatto(uuid, uuid) from public, anon, authenticated;
revoke all on function public.approvvigionamento_autorizzato() from public, anon, authenticated;
