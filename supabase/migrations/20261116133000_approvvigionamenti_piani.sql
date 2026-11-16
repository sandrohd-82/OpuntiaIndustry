-- Piani di approvvigionamento e revisione delle bozze.
-- Non pubblica, non invia mail, non apre fogli HACCP.
-- Non modifica la migrazione già applicata degli ordini.

alter table public.approvvigionamenti_operazioni
  add column if not exists impronta jsonb,
  add column if not exists riferimento_id uuid;

alter table public.approvvigionamenti_operazioni
  drop constraint if exists approvvigionamenti_operazioni_tipo_check;
alter table public.approvvigionamenti_operazioni
  add constraint approvvigionamenti_operazioni_tipo_check
  check (tipo in ('crea', 'aggiorna', 'copia', 'settimana', 'piano', 'composizione'));

alter table public.approvvigionamenti_ordini
  add column if not exists revisione integer not null default 1;

do $$
begin
  if not exists (
    select 1 from pg_constraint where conname = 'approvvigionamenti_ordini_revisione_check'
  ) then
    alter table public.approvvigionamenti_ordini
      add constraint approvvigionamenti_ordini_revisione_check
      check (revisione > 0);
  end if;
end $$;

comment on column public.approvvigionamenti_ordini.revisione is
  'Numero della bozza. Un salvataggio applica solo la revisione attesa e poi la incrementa.';
comment on column public.approvvigionamenti_operazioni.impronta is
  'Contenuto esatto dell''operazione. La stessa chiave non può ripetere un contenuto diverso.';

create sequence if not exists public.approvvigionamenti_piani_codice_seq;

create table if not exists public.approvvigionamenti_piani (
  id uuid primary key default gen_random_uuid(),
  codice text not null,
  fornitore_id uuid not null references public.fornitori (id),
  periodo_inizio date not null,
  periodo_fine date not null,
  tipologia text not null check (tipologia in ('settimanale', 'mensile')),
  stato text not null default 'bozza' check (stato = 'bozza'),
  note text not null default '',
  revisione integer not null default 1 check (revisione > 0),
  pubblicato_at timestamptz,
  versione_pubblicata integer,
  presa_visione_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  created_by uuid,
  updated_by uuid,
  deleted_at timestamptz,
  deleted_by uuid,
  constraint approvvigionamenti_piani_periodo_check check (periodo_fine >= periodo_inizio)
);

create unique index if not exists approvvigionamenti_piani_codice_uidx
  on public.approvvigionamenti_piani (codice)
  where deleted_at is null;

create index if not exists approvvigionamenti_piani_periodo_idx
  on public.approvvigionamenti_piani (periodo_inizio, periodo_fine)
  where deleted_at is null;

comment on table public.approvvigionamenti_piani is
  'Piano di un solo fornitore. Versione immutabile e presa visione restano vuote fino alla fase successiva.';

create table if not exists public.approvvigionamenti_piani_ordini (
  piano_id uuid not null references public.approvvigionamenti_piani (id),
  ordine_id uuid not null references public.approvvigionamenti_ordini (id),
  created_at timestamptz not null default now(),
  created_by uuid,
  primary key (piano_id, ordine_id)
);

create unique index if not exists approvvigionamenti_piani_ordini_ordine_uidx
  on public.approvvigionamenti_piani_ordini (ordine_id);

comment on table public.approvvigionamenti_piani_ordini is
  'Composizione del piano. Ogni ordine giornaliero appartiene al massimo a un piano.';

drop trigger if exists approvvigionamenti_piani_updated_at on public.approvvigionamenti_piani;
create trigger approvvigionamenti_piani_updated_at
  before update on public.approvvigionamenti_piani
  for each row execute function public.set_updated_at();

create or replace function public.approvvigionamenti_piani_solo_bozza()
returns trigger
language plpgsql
as $$
begin
  if new.stato is distinct from 'bozza'
     or new.pubblicato_at is not null
     or new.versione_pubblicata is not null
     or new.presa_visione_at is not null
  then
    raise exception 'Pubblicazione e presa visione del piano non sono attive';
  end if;
  return new;
end;
$$;

drop trigger if exists approvvigionamenti_piani_solo_bozza on public.approvvigionamenti_piani;
create trigger approvvigionamenti_piani_solo_bozza
  before insert or update on public.approvvigionamenti_piani
  for each row execute function public.approvvigionamenti_piani_solo_bozza();

create or replace function public.approvvigionamento_entro_validita(
  p_at timestamptz,
  p_giorni integer
)
returns boolean
language sql
stable
set search_path = public
as $$
  select p_at is not null
    and (
      p_giorni is null
      or (
        (p_at at time zone 'UTC' + make_interval(days => p_giorni)) at time zone 'UTC'
      ) >= now()
    );
$$;

comment on function public.approvvigionamento_entro_validita(timestamptz, integer) is
  'Scadenza in giorni di 24 ore UTC. Senza giorni basta la conferma. È la regola usata anche dal codice.';

create or replace function public.approvvigionamento_acquisisci_operazione(
  p_chiave text,
  p_tipo text,
  p_impronta jsonb,
  p_riferimento uuid
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_id uuid;
  v_tipo text;
  v_impronta jsonb;
  v_riferimento uuid;
begin
  if p_chiave is null or length(btrim(p_chiave)) < 8 then
    raise exception 'Chiave operazione non valida';
  end if;
  if p_tipo not in ('crea', 'copia', 'settimana', 'piano', 'aggiorna', 'composizione') then
    raise exception 'Tipo operazione non valido';
  end if;

  insert into public.approvvigionamenti_operazioni (
    chiave, tipo, impronta, riferimento_id, created_by
  )
  values (p_chiave, p_tipo, p_impronta, p_riferimento, public.app_effective_uid())
  on conflict (chiave) do nothing
  returning id into v_id;

  if v_id is not null then
    return v_id;
  end if;

  select tipo, impronta, riferimento_id
    into v_tipo, v_impronta, v_riferimento
  from public.approvvigionamenti_operazioni
  where chiave = p_chiave;

  if v_tipo is distinct from p_tipo
     or v_impronta is distinct from p_impronta
     or v_riferimento is distinct from p_riferimento
  then
    raise exception 'La chiave è già stata usata per un''altra operazione.';
  end if;
  return null;
end;
$$;

create or replace function public.approvvigionamento_valida_righe(
  p_fornitore uuid,
  p_righe jsonb
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_materie uuid[];
  v_esito text;
  v_riga jsonb;
  v_unita text;
  v_unita_catalogo text;
begin
  select coalesce(array_agg(distinct (riga->>'materiaPrimaId')::uuid), array[]::uuid[])
    into v_materie
  from jsonb_array_elements(coalesce(p_righe, '[]'::jsonb)) riga;
  v_esito := public.fornitore_assegnabile_approvvigionamento(p_fornitore, v_materie);
  if v_esito <> 'ok' then
    raise exception '%', v_esito;
  end if;
  if jsonb_typeof(p_righe) <> 'array' or jsonb_array_length(p_righe) = 0 then
    raise exception 'Serve almeno una materia prima.';
  end if;
  for v_riga in select value from jsonb_array_elements(p_righe)
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
end;
$$;

create or replace function public.approvvigionamento_crea_piani(
  p_tipo text,
  p_ordini uuid[]
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_fornitore uuid;
  v_min date;
  v_max date;
  v_inizio date;
  v_fine date;
  v_tipologia text;
  v_piano uuid;
  v_codice text;
  v_piani jsonb := '[]'::jsonb;
begin
  if p_tipo not in ('settimana', 'piano') then
    return '[]'::jsonb;
  end if;

  for v_fornitore, v_min, v_max in
    select o.fornitore_id, min(o.data_consegna), max(o.data_consegna)
    from public.approvvigionamenti_ordini o
    where o.id = any(p_ordini)
    group by o.fornitore_id
  loop
    if p_tipo = 'settimana' then
      v_inizio := date_trunc('week', v_min::timestamp)::date;
      v_fine := v_inizio + 6;
      if v_max > v_fine then
        raise exception 'Un piano settimanale resta nella stessa settimana.';
      end if;
      v_tipologia := 'settimanale';
    else
      if date_trunc('month', v_min::timestamp) <> date_trunc('month', v_max::timestamp) then
        raise exception 'Un piano mensile resta nello stesso mese.';
      end if;
      v_inizio := date_trunc('month', v_min::timestamp)::date;
      v_fine := (v_inizio + interval '1 month' - interval '1 day')::date;
      v_tipologia := 'mensile';
    end if;

    v_codice := 'PP-' || to_char(current_date, 'YY') || '-'
      || lpad(nextval('public.approvvigionamenti_piani_codice_seq')::text, 4, '0');
    insert into public.approvvigionamenti_piani (
      codice, fornitore_id, periodo_inizio, periodo_fine, tipologia, stato,
      created_by, updated_by
    )
    values (
      v_codice, v_fornitore, v_inizio, v_fine, v_tipologia, 'bozza',
      public.app_effective_uid(), public.app_effective_uid()
    )
    returning id into v_piano;

    insert into public.approvvigionamenti_piani_ordini (piano_id, ordine_id, created_by)
    select v_piano, o.id, public.app_effective_uid()
    from public.approvvigionamenti_ordini o
    where o.id = any(p_ordini)
      and o.fornitore_id = v_fornitore;

    v_piani := v_piani || jsonb_build_array(jsonb_build_object(
      'id', v_piano,
      'codice', v_codice,
      'fornitoreId', v_fornitore,
      'tipologia', v_tipologia,
      'periodoInizio', v_inizio,
      'periodoFine', v_fine
    ));
  end loop;

  return v_piani;
end;
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
  v_ordine_id uuid;
  v_fornitore uuid;
  v_ids uuid[] := array[]::uuid[];
  v_piani jsonb;
  v_elenco jsonb;
begin
  if not public.approvvigionamento_autorizzato() then
    raise exception 'Non autorizzato a registrare gli approvvigionamenti';
  end if;
  if p_tipo not in ('crea', 'copia', 'settimana', 'piano') then
    raise exception 'Tipo operazione non valido';
  end if;
  if jsonb_typeof(p_ordini) <> 'array' or jsonb_array_length(p_ordini) = 0 then
    raise exception 'Nessun ordine da registrare';
  end if;

  v_operazione := public.approvvigionamento_acquisisci_operazione(
    p_chiave, p_tipo, p_ordini, null
  );
  if v_operazione is null then
    select id into v_operazione
    from public.approvvigionamenti_operazioni
    where chiave = p_chiave;
    select coalesce(jsonb_agg(jsonb_build_object(
      'id', o.id,
      'codice', o.codice,
      'dataConsegna', o.data_consegna
    ) order by o.data_consegna, o.codice), '[]'::jsonb)
      into v_elenco
    from public.approvvigionamenti_operazioni_ordini l
    join public.approvvigionamenti_ordini o on o.id = l.ordine_id
    where l.operazione_id = v_operazione
      and o.deleted_at is null;
    select coalesce(jsonb_agg(jsonb_build_object(
      'id', p.id,
      'codice', p.codice,
      'fornitoreId', p.fornitore_id,
      'tipologia', p.tipologia,
      'periodoInizio', p.periodo_inizio,
      'periodoFine', p.periodo_fine
    ) order by p.codice), '[]'::jsonb)
      into v_piani
    from public.approvvigionamenti_piani p
    where p.deleted_at is null
      and exists (
        select 1
        from public.approvvigionamenti_piani_ordini po
        join public.approvvigionamenti_operazioni_ordini l on l.ordine_id = po.ordine_id
        where po.piano_id = p.id
          and l.operazione_id = v_operazione
      );
    return jsonb_build_object('riusata', true, 'ordini', v_elenco, 'piani', v_piani);
  end if;

  for v_ordine in select value from jsonb_array_elements(p_ordini)
  loop
    v_fornitore := (v_ordine->>'fornitoreId')::uuid;
    perform public.approvvigionamento_valida_righe(v_fornitore, v_ordine->'righe');

    insert into public.approvvigionamenti_ordini (
      codice, fornitore_id, data_consegna, note, stato, origine_ordine_id,
      revisione, created_by, updated_by
    )
    values (
      'AP-' || to_char(current_date, 'YY') || '-' || lpad(nextval('public.approvvigionamenti_codice_seq')::text, 4, '0'),
      v_fornitore,
      (v_ordine->>'dataConsegna')::date,
      left(coalesce(v_ordine->>'note', ''), 2000),
      'bozza',
      nullif(v_ordine->>'origineOrdineId', '')::uuid,
      1,
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

  v_piani := public.approvvigionamento_crea_piani(p_tipo, v_ids);

  select coalesce(jsonb_agg(jsonb_build_object(
    'id', o.id,
    'codice', o.codice,
    'dataConsegna', o.data_consegna
  ) order by o.data_consegna, o.codice), '[]'::jsonb)
    into v_elenco
  from public.approvvigionamenti_ordini o
  where o.id = any(v_ids);
  return jsonb_build_object('riusata', false, 'ordini', v_elenco, 'piani', v_piani);
end;
$$;

create or replace function public.aggiorna_approvvigionamento(
  p_chiave text,
  p_ordine_id uuid,
  p_ordine jsonb,
  p_revisione integer
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_operazione uuid;
  v_fornitore uuid;
  v_aggiornato uuid;
  v_revisione integer;
begin
  if not public.approvvigionamento_autorizzato() then
    raise exception 'Non autorizzato a registrare gli approvvigionamenti';
  end if;
  if p_revisione is null or p_revisione <= 0 then
    raise exception 'Revisione della bozza mancante';
  end if;

  perform 1
  from public.approvvigionamenti_ordini
  where id = p_ordine_id
  for update;

  v_operazione := public.approvvigionamento_acquisisci_operazione(
    p_chiave,
    'aggiorna',
    p_ordine || jsonb_build_object('revisioneAttesa', p_revisione),
    p_ordine_id
  );
  if v_operazione is null then
    select revisione into v_revisione
    from public.approvvigionamenti_ordini
    where id = p_ordine_id;
    return jsonb_build_object('riusata', true, 'id', p_ordine_id, 'revisione', v_revisione);
  end if;

  v_fornitore := (p_ordine->>'fornitoreId')::uuid;
  perform public.approvvigionamento_valida_righe(v_fornitore, p_ordine->'righe');
  if exists (
    select 1
    from public.approvvigionamenti_piani_ordini po
    join public.approvvigionamenti_piani p on p.id = po.piano_id
    where po.ordine_id = p_ordine_id
      and p.deleted_at is null
      and (
        p.fornitore_id <> v_fornitore
        or (p_ordine->>'dataConsegna')::date < p.periodo_inizio
        or (p_ordine->>'dataConsegna')::date > p.periodo_fine
      )
  ) then
    raise exception 'L''ordine resta nel periodo e nel fornitore del suo piano.';
  end if;

  update public.approvvigionamenti_ordini
  set fornitore_id = v_fornitore,
      data_consegna = (p_ordine->>'dataConsegna')::date,
      note = left(coalesce(p_ordine->>'note', ''), 2000),
      updated_by = public.app_effective_uid(),
      revisione = revisione + 1
  where id = p_ordine_id
    and deleted_at is null
    and stato = 'bozza'
    and revisione = p_revisione
    and pubblicato_at is null
    and versione_pubblicata is null
    and presa_visione_at is null
    and foglio_ingresso_id is null
  returning id, revisione into v_aggiornato, v_revisione;

  if v_aggiornato is null then
    if exists (
      select 1 from public.approvvigionamenti_ordini
      where id = p_ordine_id and deleted_at is null and stato = 'bozza'
    ) then
      raise exception 'La bozza è stata modificata da un altro salvataggio. Ricarica e riprova.';
    end if;
    raise exception 'Ordine non trovato';
  end if;

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

  return jsonb_build_object('riusata', false, 'id', p_ordine_id, 'revisione', v_revisione);
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
begin
  raise exception 'La modifica richiede la revisione della bozza. Ricarica la pagina.';
end;
$$;

create or replace function public.aggiorna_composizione_piano(
  p_chiave text,
  p_piano_id uuid,
  p_revisione integer,
  p_ordini uuid[]
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_operazione uuid;
  v_fornitore uuid;
  v_inizio date;
  v_fine date;
  v_stato text;
  v_revisione integer;
  v_pubblicato timestamptz;
  v_versione integer;
  v_presa timestamptz;
  v_deleted timestamptz;
  v_attesi integer;
  v_trovati integer;
  v_nuova integer;
  v_impronta jsonb;
begin
  if not public.approvvigionamento_autorizzato() then
    raise exception 'Non autorizzato a registrare gli approvvigionamenti';
  end if;
  if p_revisione is null or p_revisione <= 0 then
    raise exception 'Revisione del piano mancante';
  end if;
  if p_ordini is null or cardinality(p_ordini) = 0 then
    raise exception 'Il piano deve contenere almeno un ordine.';
  end if;

  select coalesce(jsonb_agg(x order by x), '[]'::jsonb)
    into v_impronta
  from (select distinct unnest(p_ordini) as x) distinti;
  v_impronta := jsonb_build_object(
    'pianoId', p_piano_id,
    'revisioneAttesa', p_revisione,
    'ordini', v_impronta
  );

  select fornitore_id, periodo_inizio, periodo_fine, stato, revisione,
         pubblicato_at, versione_pubblicata, presa_visione_at, deleted_at
    into v_fornitore, v_inizio, v_fine, v_stato, v_revisione,
         v_pubblicato, v_versione, v_presa, v_deleted
  from public.approvvigionamenti_piani
  where id = p_piano_id
  for update;

  v_operazione := public.approvvigionamento_acquisisci_operazione(
    p_chiave, 'composizione', v_impronta, p_piano_id
  );
  if v_operazione is null then
    select revisione into v_nuova
    from public.approvvigionamenti_piani
    where id = p_piano_id;
    return jsonb_build_object('riusata', true, 'id', p_piano_id, 'revisione', v_nuova);
  end if;

  if v_fornitore is null or v_deleted is not null or v_stato is distinct from 'bozza'
     or v_pubblicato is not null or v_versione is not null or v_presa is not null
  then
    raise exception 'Piano non trovato';
  end if;
  if v_revisione is distinct from p_revisione then
    raise exception 'Il piano è stato modificato da un altro salvataggio. Ricarica e riprova.';
  end if;

  select count(distinct x) into v_attesi from unnest(p_ordini) x;
  select count(*) into v_trovati
  from public.approvvigionamenti_ordini o
  where o.id = any(p_ordini)
    and o.deleted_at is null
    and o.stato = 'bozza'
    and o.fornitore_id = v_fornitore
    and o.data_consegna between v_inizio and v_fine
    and o.pubblicato_at is null
    and o.foglio_ingresso_id is null;
  if v_trovati <> v_attesi then
    raise exception 'La composizione contiene un ordine non compatibile con il piano.';
  end if;
  if exists (
    select 1
    from public.approvvigionamenti_piani_ordini l
    where l.ordine_id = any(p_ordini)
      and l.piano_id <> p_piano_id
  ) then
    raise exception 'Un ordine appartiene già a un altro piano.';
  end if;

  delete from public.approvvigionamenti_piani_ordini
  where piano_id = p_piano_id
    and not (ordine_id = any(p_ordini));

  insert into public.approvvigionamenti_piani_ordini (piano_id, ordine_id, created_by)
  select p_piano_id, o.id, public.app_effective_uid()
  from public.approvvigionamenti_ordini o
  where o.id = any(p_ordini)
    and not exists (
      select 1
      from public.approvvigionamenti_piani_ordini l
      where l.piano_id = p_piano_id
        and l.ordine_id = o.id
    );

  update public.approvvigionamenti_piani
  set revisione = revisione + 1,
      updated_by = public.app_effective_uid()
  where id = p_piano_id
    and deleted_at is null
    and stato = 'bozza'
    and revisione = p_revisione
    and pubblicato_at is null
    and versione_pubblicata is null
    and presa_visione_at is null
  returning revisione into v_nuova;

  if v_nuova is null then
    raise exception 'Il piano è stato modificato da un altro salvataggio. Ricarica e riprova.';
  end if;

  return jsonb_build_object('riusata', false, 'id', p_piano_id, 'revisione', v_nuova);
end;
$$;

alter table public.approvvigionamenti_piani enable row level security;
alter table public.approvvigionamenti_piani_ordini enable row level security;

drop policy if exists "approvvigionamenti_piani_select" on public.approvvigionamenti_piani;
create policy "approvvigionamenti_piani_select"
  on public.approvvigionamenti_piani for select to authenticated
  using (public.approvvigionamento_autorizzato());

drop policy if exists "approvvigionamenti_piani_ordini_select" on public.approvvigionamenti_piani_ordini;
create policy "approvvigionamenti_piani_ordini_select"
  on public.approvvigionamenti_piani_ordini for select to authenticated
  using (public.approvvigionamento_autorizzato());

revoke all on table public.approvvigionamenti_piani from public, anon, authenticated;
revoke all on table public.approvvigionamenti_piani_ordini from public, anon, authenticated;
grant select on public.approvvigionamenti_piani to authenticated;
grant select on public.approvvigionamenti_piani_ordini to authenticated;
revoke all on sequence public.approvvigionamenti_piani_codice_seq from public, anon, authenticated;

revoke all on function public.approvvigionamento_entro_validita(timestamptz, integer) from public, anon, authenticated;
revoke all on function public.approvvigionamento_acquisisci_operazione(text, text, jsonb, uuid) from public, anon, authenticated;
revoke all on function public.approvvigionamento_valida_righe(uuid, jsonb) from public, anon, authenticated;
revoke all on function public.approvvigionamento_crea_piani(text, uuid[]) from public, anon, authenticated;
revoke all on function public.approvvigionamenti_piani_solo_bozza() from public, anon, authenticated;

revoke all on function public.registra_approvvigionamenti(text, text, jsonb) from public, anon;
grant execute on function public.registra_approvvigionamenti(text, text, jsonb) to authenticated;
revoke all on function public.aggiorna_approvvigionamento(text, uuid, jsonb, integer) from public, anon;
grant execute on function public.aggiorna_approvvigionamento(text, uuid, jsonb, integer) to authenticated;
revoke all on function public.aggiorna_approvvigionamento(text, uuid, jsonb) from public, anon;
grant execute on function public.aggiorna_approvvigionamento(text, uuid, jsonb) to authenticated;
revoke all on function public.aggiorna_composizione_piano(text, uuid, integer, uuid[]) from public, anon;
grant execute on function public.aggiorna_composizione_piano(text, uuid, integer, uuid[]) to authenticated;
