-- Coerenza della pubblicazione e segnali del portale.
-- Non cancella versioni, non apre fogli HACCP e non tocca gli ordini commerciali.
-- Ordine dei lock: prima il piano, poi gli ordini in ordine di id.

create or replace function public.approvvigionamento_blocca_ordine(p_ordine_id uuid)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_piano uuid;
  v_attuale uuid;
begin
  select l.piano_id
    into v_piano
  from public.approvvigionamenti_piani_ordini l
  where l.ordine_id = p_ordine_id
  order by l.piano_id
  limit 1;

  if v_piano is not null then
    perform 1
    from public.approvvigionamenti_piani
    where id = v_piano
    for update;
  end if;

  perform 1
  from public.approvvigionamenti_ordini
  where id = p_ordine_id
  for update;

  select l.piano_id
    into v_attuale
  from public.approvvigionamenti_piani_ordini l
  where l.ordine_id = p_ordine_id
  order by l.piano_id
  limit 1;

  if v_attuale is distinct from v_piano then
    raise exception 'L''ordine è stato spostato di piano. Ricarica e riprova.';
  end if;
  return v_piano;
end;
$$;

comment on function public.approvvigionamento_blocca_ordine(uuid) is
  'Lock del piano, se presente, e poi dell''ordine. Stesso ordine usato dalla pubblicazione.';

create or replace function public.approvvigionamento_congela_ordine(
  p_ordine_id uuid,
  p_revisione integer,
  p_notifica boolean
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_fornitore uuid;
  v_revisione integer;
  v_codice text;
  v_data date;
  v_note text;
  v_deleted timestamptz;
  v_stato text;
  v_righe jsonb;
  v_versione uuid;
  v_numero integer;
  v_notifica uuid;
begin
  perform set_config('approvvigionamento.pubblica', '1', true);
  perform public.approvvigionamento_blocca_ordine(p_ordine_id);

  select fornitore_id, revisione, codice, data_consegna, note, deleted_at, stato
    into v_fornitore, v_revisione, v_codice, v_data, v_note, v_deleted, v_stato
  from public.approvvigionamenti_ordini
  where id = p_ordine_id;

  if v_fornitore is null or v_deleted is not null
     or v_stato not in ('bozza', 'pubblicato', 'da_ripubblicare') then
    raise exception 'Ordine non trovato';
  end if;
  if v_revisione is distinct from p_revisione then
    raise exception 'La bozza è stata modificata da un altro salvataggio. Ricarica e riprova.';
  end if;

  select id, numero
    into v_versione, v_numero
  from public.approvvigionamenti_versioni
  where ordine_id = p_ordine_id
    and revisione_bozza = p_revisione;

  if v_versione is null then
    select coalesce(jsonb_agg(jsonb_build_object(
      'materiaPrimaId', r.materia_prima_id,
      'codice', m.codice,
      'nome', m.nome,
      'quantita', r.quantita,
      'unitaMisura', r.unita_misura,
      'note', r.note
    ) order by r.sort_order), '[]'::jsonb)
      into v_righe
    from public.approvvigionamenti_righe r
    join public.materie_prime m on m.id = r.materia_prima_id
    where r.ordine_id = p_ordine_id
      and r.deleted_at is null;

    perform public.approvvigionamento_valida_righe(v_fornitore, v_righe);

    select coalesce(max(numero), 0) + 1
      into v_numero
    from public.approvvigionamenti_versioni
    where ordine_id = p_ordine_id;

    insert into public.approvvigionamenti_versioni (
      ordine_id, fornitore_id, numero, codice, data_consegna, note, righe,
      revisione_bozza, created_by
    )
    values (
      p_ordine_id, v_fornitore, v_numero, v_codice, v_data, v_note, v_righe,
      p_revisione, public.app_effective_uid()
    )
    returning id into v_versione;

    update public.approvvigionamenti_ordini
    set stato = 'pubblicato',
        versione_pubblicata = v_numero,
        pubblicato_at = now(),
        updated_by = public.app_effective_uid()
    where id = p_ordine_id
      and deleted_at is null
      and revisione = p_revisione
      and stato in ('bozza', 'pubblicato', 'da_ripubblicare');
  end if;

  if p_notifica then
    insert into public.approvvigionamenti_notifiche (
      fornitore_id, versione_ordine_id, notifica_stato, created_by, updated_by
    )
    values (v_fornitore, v_versione, 'non_inviata', public.app_effective_uid(), public.app_effective_uid())
    on conflict (versione_ordine_id) do nothing;
    select id into v_notifica
    from public.approvvigionamenti_notifiche
    where versione_ordine_id = v_versione;
  end if;

  return jsonb_build_object(
    'id', v_versione,
    'numero', v_numero,
    'notificaId', v_notifica,
    'riusata', v_numero is not null and v_righe is null
  );
end;
$$;

create or replace function public.pubblica_approvvigionamento_piano(
  p_chiave text,
  p_piano_id uuid,
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
  v_revisione integer;
  v_tipologia text;
  v_inizio date;
  v_fine date;
  v_codice text;
  v_deleted timestamptz;
  v_stato text;
  v_versione uuid;
  v_numero integer;
  v_ordini jsonb := '[]'::jsonb;
  v_ordine record;
  v_congelato jsonb;
  v_notifica uuid;
  v_ids uuid[];
  v_id uuid;
begin
  if not public.approvvigionamento_autorizzato() then
    raise exception 'Non autorizzato a pubblicare gli approvvigionamenti';
  end if;
  perform set_config('approvvigionamento.pubblica', '1', true);

  select fornitore_id, revisione, tipologia, periodo_inizio, periodo_fine, codice, deleted_at, stato
    into v_fornitore, v_revisione, v_tipologia, v_inizio, v_fine, v_codice, v_deleted, v_stato
  from public.approvvigionamenti_piani
  where id = p_piano_id
  for update;

  if v_fornitore is null or v_deleted is not null
     or v_stato not in ('bozza', 'pubblicato', 'da_ripubblicare') then
    raise exception 'Piano non trovato';
  end if;
  if v_revisione is distinct from p_revisione then
    raise exception 'Il piano è stato modificato da un altro salvataggio. Ricarica e riprova.';
  end if;

  v_operazione := public.approvvigionamento_acquisisci_operazione(
    p_chiave,
    'pubblica',
    jsonb_build_object('pianoId', p_piano_id, 'revisioneAttesa', p_revisione),
    p_piano_id
  );

  select id, numero
    into v_versione, v_numero
  from public.approvvigionamenti_piani_versioni
  where piano_id = p_piano_id
    and revisione_bozza = p_revisione;

  if v_versione is null then
    select coalesce(array_agg(o.id order by o.id), '{}'::uuid[])
      into v_ids
    from public.approvvigionamenti_piani_ordini l
    join public.approvvigionamenti_ordini o on o.id = l.ordine_id
    where l.piano_id = p_piano_id
      and o.deleted_at is null
      and o.fornitore_id = v_fornitore;

    if cardinality(v_ids) = 0 then
      raise exception 'Il piano deve contenere almeno un ordine.';
    end if;

    foreach v_id in array v_ids loop
      perform 1
      from public.approvvigionamenti_ordini
      where id = v_id
      for update;
    end loop;

    for v_ordine in
      select o.id, o.revisione, o.codice, o.data_consegna
      from public.approvvigionamenti_ordini o
      where o.id = any(v_ids)
      order by o.id
    loop
      v_congelato := public.approvvigionamento_congela_ordine(v_ordine.id, v_ordine.revisione, false);
      v_ordini := v_ordini || jsonb_build_array(jsonb_build_object(
        'ordineId', v_ordine.id,
        'versioneId', v_congelato->>'id',
        'numero', (v_congelato->>'numero')::integer,
        'codice', v_ordine.codice,
        'dataConsegna', v_ordine.data_consegna
      ));
    end loop;

    select coalesce(max(numero), 0) + 1
      into v_numero
    from public.approvvigionamenti_piani_versioni
    where piano_id = p_piano_id;

    insert into public.approvvigionamenti_piani_versioni (
      piano_id, fornitore_id, numero, codice, tipologia, periodo_inizio, periodo_fine,
      ordini, revisione_bozza, created_by
    )
    values (
      p_piano_id, v_fornitore, v_numero, v_codice, v_tipologia, v_inizio, v_fine,
      v_ordini, p_revisione, public.app_effective_uid()
    )
    returning id into v_versione;

    update public.approvvigionamenti_piani
    set stato = 'pubblicato',
        versione_pubblicata = v_numero,
        pubblicato_at = now(),
        updated_by = public.app_effective_uid()
    where id = p_piano_id
      and revisione = p_revisione
      and deleted_at is null;
  end if;

  insert into public.approvvigionamenti_notifiche (
    fornitore_id, versione_piano_id, notifica_stato, created_by, updated_by
  )
  values (v_fornitore, v_versione, 'non_inviata', public.app_effective_uid(), public.app_effective_uid())
  on conflict (versione_piano_id) do nothing;
  select id into v_notifica
  from public.approvvigionamenti_notifiche
  where versione_piano_id = v_versione;

  return jsonb_build_object(
    'id', v_versione,
    'numero', v_numero,
    'notificaId', v_notifica,
    'riusata', v_operazione is null,
    'ordini', coalesce((
      select ordini from public.approvvigionamenti_piani_versioni where id = v_versione
    ), '[]'::jsonb)
  );
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
  v_piano uuid;
begin
  if not public.approvvigionamento_autorizzato() then
    raise exception 'Non autorizzato a registrare gli approvvigionamenti';
  end if;
  if p_revisione is null or p_revisione <= 0 then
    raise exception 'Revisione della bozza mancante';
  end if;

  v_piano := public.approvvigionamento_blocca_ordine(p_ordine_id);

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
      revisione = revisione + 1,
      stato = case
        when versione_pubblicata is not null then 'da_ripubblicare'
        else stato
      end
  where id = p_ordine_id
    and deleted_at is null
    and stato in ('bozza', 'pubblicato', 'da_ripubblicare')
    and revisione = p_revisione
    and presa_visione_at is null
    and foglio_ingresso_id is null
  returning id, revisione into v_aggiornato, v_revisione;

  if v_aggiornato is null then
    if exists (
      select 1 from public.approvvigionamenti_ordini
      where id = p_ordine_id
        and deleted_at is null
        and stato in ('bozza', 'pubblicato', 'da_ripubblicare')
    ) then
      raise exception 'La bozza è stata modificata da un altro salvataggio. Ricarica e riprova.';
    end if;
    raise exception 'Ordine non trovato';
  end if;

  if v_piano is not null then
    update public.approvvigionamenti_piani
    set revisione = revisione + 1,
        updated_by = public.app_effective_uid(),
        stato = case
          when versione_pubblicata is not null then 'da_ripubblicare'
          else stato
        end
    where id = v_piano
      and deleted_at is null;
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
  v_deleted timestamptz;
  v_attesi integer;
  v_trovati integer;
  v_nuova integer;
  v_impronta jsonb;
  v_pubblicata integer;
  v_id uuid;
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

  select fornitore_id, periodo_inizio, periodo_fine, stato, revisione, deleted_at, versione_pubblicata
    into v_fornitore, v_inizio, v_fine, v_stato, v_revisione, v_deleted, v_pubblicata
  from public.approvvigionamenti_piani
  where id = p_piano_id
  for update;

  foreach v_id in array (
    select coalesce(array_agg(x order by x), '{}'::uuid[])
    from (
      select l.ordine_id as x
      from public.approvvigionamenti_piani_ordini l
      where l.piano_id = p_piano_id
      union
      select unnest(p_ordini)
    ) candidati
  ) loop
    perform 1
    from public.approvvigionamenti_ordini
    where id = v_id
    for update;
  end loop;

  v_operazione := public.approvvigionamento_acquisisci_operazione(
    p_chiave, 'composizione', v_impronta, p_piano_id
  );
  if v_operazione is null then
    select revisione into v_nuova
    from public.approvvigionamenti_piani
    where id = p_piano_id;
    return jsonb_build_object('riusata', true, 'id', p_piano_id, 'revisione', v_nuova);
  end if;

  if v_fornitore is null or v_deleted is not null
     or v_stato not in ('bozza', 'pubblicato', 'da_ripubblicare') then
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
    and o.stato in ('bozza', 'pubblicato', 'da_ripubblicare')
    and o.fornitore_id = v_fornitore
    and o.data_consegna between v_inizio and v_fine
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
      updated_by = public.app_effective_uid(),
      stato = case
        when versione_pubblicata is not null then 'da_ripubblicare'
        else stato
      end
  where id = p_piano_id
    and deleted_at is null
    and stato in ('bozza', 'pubblicato', 'da_ripubblicare')
    and revisione = p_revisione
    and presa_visione_at is null
  returning revisione into v_nuova;

  if v_nuova is null then
    raise exception 'Il piano è stato modificato da un altro salvataggio. Ricarica e riprova.';
  end if;

  return jsonb_build_object('riusata', false, 'id', p_piano_id, 'revisione', v_nuova);
end;
$$;

create or replace function public.approvvigionamenti_segnali_portale()
returns table (
  ambito text,
  riferimento_id uuid,
  versione_pubblicata integer,
  bozza_non_pubblicata boolean
)
language sql
stable
security definer
set search_path = public
as $$
  select 'ordine'::text, o.id, o.versione_pubblicata, o.stato = 'da_ripubblicare'
  from public.approvvigionamenti_ordini o
  where o.deleted_at is null
    and o.versione_pubblicata is not null
    and (
      public.approvvigionamento_autorizzato()
      or o.fornitore_id = public.fornitore_collegato_id()
    )
  union all
  select 'piano'::text, p.id, p.versione_pubblicata, p.stato = 'da_ripubblicare'
  from public.approvvigionamenti_piani p
  where p.deleted_at is null
    and p.versione_pubblicata is not null
    and (
      public.approvvigionamento_autorizzato()
      or p.fornitore_id = public.fornitore_collegato_id()
    );
$$;

comment on function public.approvvigionamenti_segnali_portale() is
  'Numero della versione pubblicata e presenza di una bozza successiva. Non espone note, quantità o date della bozza.';

create or replace function public.approvvigionamento_versione_coperta(p_versione_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.approvvigionamenti_versioni v
    join public.approvvigionamenti_prese_visione p
      on p.versione_ordine_id = v.id
    where v.id = p_versione_id
      and (
        public.approvvigionamento_autorizzato()
        or v.fornitore_id = public.fornitore_collegato_id()
      )
  )
  or exists (
    select 1
    from public.approvvigionamenti_prese_visione p
    join public.approvvigionamenti_piani_versioni pv
      on pv.id = p.versione_piano_id
    where (
        public.approvvigionamento_autorizzato()
        or pv.fornitore_id = public.fornitore_collegato_id()
      )
      and exists (
        select 1
        from jsonb_array_elements(coalesce(p.copertura, '[]'::jsonb)) elemento
        where elemento->>'versioneId' = p_versione_id::text
      )
  );
$$;

comment on function public.approvvigionamento_versione_coperta(uuid) is
  'Vera solo se la presa visione riguarda questa versione, direttamente o nello snapshot del piano.';

revoke all on function public.approvvigionamento_blocca_ordine(uuid) from public, anon, authenticated;
revoke all on function public.approvvigionamento_congela_ordine(uuid, integer, boolean) from public, anon, authenticated;
revoke all on function public.approvvigionamenti_segnali_portale() from public, anon;
revoke all on function public.approvvigionamento_versione_coperta(uuid) from public, anon;
grant execute on function public.approvvigionamenti_segnali_portale() to authenticated;
grant execute on function public.approvvigionamento_versione_coperta(uuid) to authenticated;
grant execute on function public.approvvigionamento_autorizzato() to authenticated;
