-- Il saldo delle materie prime non è più autorizzato dal solo proprietario
-- della funzione. Due ruoli senza login vengono assunti solo dalle operazioni
-- di movimento e di pulizia. Le altre funzioni, anche SECURITY DEFINER dello
-- stesso proprietario, restano su current_user originario e vengono rifiutate.
-- Il client non riceve questi ruoli e non può impostarli.

do $$
begin
  if not exists (select 1 from pg_roles where rolname = 'magazzino_mp_movimento') then
    create role magazzino_mp_movimento nologin noinherit;
  end if;
  if not exists (select 1 from pg_roles where rolname = 'magazzino_mp_pulizia') then
    create role magazzino_mp_pulizia nologin noinherit;
  end if;
end $$;

revoke magazzino_mp_movimento from anon, authenticated, service_role;
revoke magazzino_mp_pulizia from anon, authenticated, service_role;
grant magazzino_mp_movimento to current_user;
grant magazzino_mp_pulizia to current_user;
grant usage, create on schema public to magazzino_mp_movimento;
grant usage, create on schema public to magazzino_mp_pulizia;
-- Nessuna membership: il client non può fare SET ROLE.
-- Le funzioni di registro diventano di proprietà di questi ruoli e, essendo
-- SECURITY DEFINER, girano già come tali. Non serve SET ROLE.

grant select, insert on public.magazzino_giacenze to magazzino_mp_movimento;
grant update (quantita_kg, updated_by, updated_at)
  on public.magazzino_giacenze to magazzino_mp_movimento;
grant select, insert on public.magazzino_movimenti to magazzino_mp_movimento;

grant select on public.magazzino_giacenze to magazzino_mp_pulizia;
grant update (deleted_at, deleted_by, updated_by, updated_at)
  on public.magazzino_giacenze to magazzino_mp_pulizia;
grant select on public.magazzino_movimenti to magazzino_mp_pulizia;
grant update (deleted_at, deleted_by, updated_by, updated_at)
  on public.magazzino_movimenti to magazzino_mp_pulizia;

drop policy if exists "magazzino_giacenze_mp_movimento_sel" on public.magazzino_giacenze;
create policy "magazzino_giacenze_mp_movimento_sel"
  on public.magazzino_giacenze for select
  to magazzino_mp_movimento
  using (catalog_kind = 'materia_prima');

drop policy if exists "magazzino_giacenze_mp_movimento_ins" on public.magazzino_giacenze;
create policy "magazzino_giacenze_mp_movimento_ins"
  on public.magazzino_giacenze for insert
  to magazzino_mp_movimento
  with check (
    catalog_kind = 'materia_prima'
    and is_test = false
    and deleted_at is null
  );

drop policy if exists "magazzino_giacenze_mp_movimento_upd" on public.magazzino_giacenze;
create policy "magazzino_giacenze_mp_movimento_upd"
  on public.magazzino_giacenze for update
  to magazzino_mp_movimento
  using (
    catalog_kind = 'materia_prima'
    and is_test = false
    and deleted_at is null
  )
  with check (
    catalog_kind = 'materia_prima'
    and is_test = false
    and deleted_at is null
  );

drop policy if exists "magazzino_movimenti_mp_movimento_sel" on public.magazzino_movimenti;
create policy "magazzino_movimenti_mp_movimento_sel"
  on public.magazzino_movimenti for select
  to magazzino_mp_movimento
  using (catalog_kind = 'materia_prima');

drop policy if exists "magazzino_movimenti_mp_movimento_ins" on public.magazzino_movimenti;
create policy "magazzino_movimenti_mp_movimento_ins"
  on public.magazzino_movimenti for insert
  to magazzino_mp_movimento
  with check (
    catalog_kind = 'materia_prima'
    and is_test = false
    and deleted_at is null
  );

drop policy if exists "magazzino_giacenze_mp_pulizia_sel" on public.magazzino_giacenze;
create policy "magazzino_giacenze_mp_pulizia_sel"
  on public.magazzino_giacenze for select
  to magazzino_mp_pulizia
  using (catalog_kind = 'materia_prima');

drop policy if exists "magazzino_giacenze_mp_pulizia_upd" on public.magazzino_giacenze;
create policy "magazzino_giacenze_mp_pulizia_upd"
  on public.magazzino_giacenze for update
  to magazzino_mp_pulizia
  using (catalog_kind = 'materia_prima' and is_test and deleted_at is null)
  with check (catalog_kind = 'materia_prima' and is_test);

drop policy if exists "magazzino_movimenti_mp_pulizia_sel" on public.magazzino_movimenti;
create policy "magazzino_movimenti_mp_pulizia_sel"
  on public.magazzino_movimenti for select
  to magazzino_mp_pulizia
  using (catalog_kind = 'materia_prima');

drop policy if exists "magazzino_movimenti_mp_pulizia_upd" on public.magazzino_movimenti;
create policy "magazzino_movimenti_mp_pulizia_upd"
  on public.magazzino_movimenti for update
  to magazzino_mp_pulizia
  using (catalog_kind = 'materia_prima' and is_test and deleted_at is null)
  with check (catalog_kind = 'materia_prima' and is_test);

grant select on public.materie_prime to magazzino_mp_movimento;
drop policy if exists "materie_prime_select_mp_movimento" on public.materie_prime;
create policy "materie_prime_select_mp_movimento"
  on public.materie_prime for select
  to magazzino_mp_movimento
  using (true);

grant insert on public.audit_log to magazzino_mp_movimento;
grant insert on public.audit_log to magazzino_mp_pulizia;
drop policy if exists "audit_log_insert_mp_movimento" on public.audit_log;
create policy "audit_log_insert_mp_movimento"
  on public.audit_log for insert
  to magazzino_mp_movimento
  with check (entity_type = 'magazzino_movimenti' and action = 'create');
drop policy if exists "audit_log_insert_mp_pulizia" on public.audit_log;
create policy "audit_log_insert_mp_pulizia"
  on public.audit_log for insert
  to magazzino_mp_pulizia
  with check (entity_type = 'magazzino_mp_operazioni' and action = 'soft_delete');

grant select, insert on public.magazzino_mp_operazioni to magazzino_mp_pulizia;
drop policy if exists "magazzino_mp_operazioni_pulizia_sel" on public.magazzino_mp_operazioni;
create policy "magazzino_mp_operazioni_pulizia_sel"
  on public.magazzino_mp_operazioni for select
  to magazzino_mp_pulizia
  using (true);
drop policy if exists "magazzino_mp_operazioni_pulizia_ins" on public.magazzino_mp_operazioni;
create policy "magazzino_mp_operazioni_pulizia_ins"
  on public.magazzino_mp_operazioni for insert
  to magazzino_mp_pulizia
  with check (tipo = 'pulizia_test');

create or replace function public.magazzino_mp_esecutore_registro()
returns boolean
language sql
immutable
as $$
  select false;
$$;

comment on function public.magazzino_mp_esecutore_registro() is
  'Disattivata. Il registro non si autorizza più con il proprietario della funzione.';

create or replace function public.magazzino_giacenze_proteggi_mp()
returns trigger
language plpgsql
security invoker
set search_path = public
as $$
declare
  v_movimento boolean := current_user = 'magazzino_mp_movimento';
  v_pulizia boolean := current_user = 'magazzino_mp_pulizia';
begin
  if tg_op = 'DELETE' then
    if old.catalog_kind = 'materia_prima' then
      raise exception 'La giacenza di una materia prima non si cancella fisicamente.';
    end if;
    return old;
  end if;

  if tg_op = 'INSERT' then
    if new.catalog_kind = 'materia_prima' and new.quantita_kg <> 0 and not v_movimento then
      raise exception 'La giacenza di una materia prima si aggiorna solo registrando un movimento.';
    end if;
    return new;
  end if;

  if old.catalog_kind is distinct from 'materia_prima'
     and new.catalog_kind is distinct from 'materia_prima' then
    return new;
  end if;

  if new.catalog_kind is distinct from old.catalog_kind
     or new.prodotto_id is distinct from old.prodotto_id then
    raise exception 'Non si sposta la giacenza di una materia prima.';
  end if;

  if new.quantita_kg is distinct from old.quantita_kg and not v_movimento then
    raise exception 'La quantità di una materia prima non si modifica direttamente. Registra un movimento.';
  end if;

  if new.unita is distinct from old.unita and not v_movimento then
    raise exception 'L''unità della giacenza materia prima non si modifica da questa scheda.';
  end if;

  if old.is_test is distinct from new.is_test and not v_movimento then
    raise exception 'Il flag di test della giacenza materia prima non si modifica.';
  end if;

  if new.deleted_at is distinct from old.deleted_at then
    if new.quantita_kg is distinct from old.quantita_kg then
      raise exception 'Non si azzera una giacenza materia prima diversa da zero.';
    end if;
    if v_pulizia then
      if old.is_test is not true then
        raise exception 'La pulizia riguarda solo le giacenze di test.';
      end if;
    elsif old.quantita_kg <> 0 then
      raise exception 'Non si elimina una giacenza materia prima diversa da zero.';
    end if;
  end if;

  if (to_jsonb(new) - 'updated_at' - 'updated_by' - 'deleted_at' - 'deleted_by'
        - 'quantita_riserva' - 'reparto_id' - 'prodotto_codice' - 'quantita_kg')
     is distinct from
     (to_jsonb(old) - 'updated_at' - 'updated_by' - 'deleted_at' - 'deleted_by'
        - 'quantita_riserva' - 'reparto_id' - 'prodotto_codice' - 'quantita_kg') then
    raise exception 'Dati della giacenza materia prima non modificabili.';
  end if;

  return new;
end;
$$;

create or replace function public.magazzino_movimenti_proteggi_mp()
returns trigger
language plpgsql
security invoker
set search_path = public
as $$
declare
  v_movimento boolean := current_user = 'magazzino_mp_movimento';
  v_pulizia boolean := current_user = 'magazzino_mp_pulizia';
begin
  if tg_op = 'DELETE' then
    if old.catalog_kind = 'materia_prima' then
      raise exception 'Un movimento di materia prima non si cancella fisicamente.';
    end if;
    return old;
  end if;

  if tg_op = 'INSERT' then
    if new.catalog_kind = 'materia_prima' and not v_movimento then
      raise exception 'Il movimento di materia prima si registra solo con l''operazione di magazzino.';
    end if;
    return new;
  end if;

  if old.catalog_kind is distinct from 'materia_prima'
     and new.catalog_kind is distinct from 'materia_prima' then
    return new;
  end if;

  if (to_jsonb(new) - 'updated_at' - 'updated_by' - 'deleted_at' - 'deleted_by')
     is distinct from
     (to_jsonb(old) - 'updated_at' - 'updated_by' - 'deleted_at' - 'deleted_by') then
    raise exception 'Un movimento operativo di materia prima non si modifica.';
  end if;

  if new.deleted_at is distinct from old.deleted_at then
    if not v_pulizia then
      raise exception 'Un movimento di materia prima non si elimina.';
    end if;
    if old.is_test is not true then
      raise exception 'Si possono chiudere solo i movimenti di test delle materie prime.';
    end if;
  end if;

  return new;
end;
$$;

set local role magazzino_mp_movimento;

create or replace function public.magazzino_mp_registra_movimento(
  p_prodotto_id uuid,
  p_tipo text,
  p_quantita numeric,
  p_unita text,
  p_chiave text,
  p_note text default '',
  p_barcode text default ''
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_uid uuid;
  v_chiave text;
  v_tipo text;
  v_unita text;
  v_qty numeric(14, 3);
  v_codice text;
  v_unita_anagrafica text;
  v_categoria text;
  v_deleted timestamptz;
  v_giacenza uuid;
  v_saldo numeric(14, 3);
  v_unita_giacenza text;
  v_test boolean;
  v_dopo numeric(14, 3);
  v_mov uuid;
  v_found record;
begin
  v_uid := public.app_effective_uid();
  if v_uid is null then
    raise exception 'Accesso non autenticato.';
  end if;
  if not (
    public.is_superadmin()
    or public.has_area_access('magazzino')
  ) then
    raise exception 'Non autorizzato a registrare movimenti di materie prime.';
  end if;

  v_chiave := btrim(coalesce(p_chiave, ''));
  if char_length(v_chiave) < 8 or char_length(v_chiave) > 200 then
    raise exception 'Chiave operazione non valida.';
  end if;

  v_tipo := lower(btrim(coalesce(p_tipo, '')));
  if v_tipo not in ('carico', 'scarico') then
    raise exception 'Tipo movimento non previsto. Usa carico o scarico.';
  end if;

  if p_quantita is null or p_quantita <> p_quantita or p_quantita <= 0 then
    raise exception 'La quantità deve essere maggiore di zero.';
  end if;
  if p_quantita > 1000000 then
    raise exception 'Quantità troppo grande.';
  end if;
  if p_quantita <> round(p_quantita, 3) then
    raise exception 'La quantità ha più di tre decimali. Non viene arrotondata.';
  end if;
  v_qty := round(p_quantita, 3);
  v_unita := lower(btrim(coalesce(p_unita, '')));

  perform pg_advisory_xact_lock(hashtextextended('mp-chiave:' || v_chiave, 0));
  perform pg_advisory_xact_lock(hashtextextended('mp-articolo:' || p_prodotto_id::text, 0));

  select m.id, m.prodotto_id, m.tipo, m.quantita_kg, m.unita
    into v_found
  from public.magazzino_movimenti m
  where m.catalog_kind = 'materia_prima'
    and m.chiave_idempotenza = v_chiave
    and m.deleted_at is null;

  if found then
    if v_found.prodotto_id is distinct from p_prodotto_id
       or v_found.tipo is distinct from v_tipo
       or v_found.unita is distinct from v_unita
       or v_found.quantita_kg is distinct from v_qty then
      raise exception 'Chiave operazione già usata con dati diversi.';
    end if;
    select g.quantita_kg, g.unita
      into v_saldo, v_unita_giacenza
    from public.magazzino_giacenze g
    where g.catalog_kind = 'materia_prima'
      and g.prodotto_id = p_prodotto_id
      and g.deleted_at is null;
    return jsonb_build_object(
      'movimento_id', v_found.id,
      'saldo', coalesce(v_saldo, 0),
      'unita', v_found.unita,
      'ripetuta', true
    );
  end if;

  select mp.codice, mp.unita_misura, mp.categoria_utilizzo, mp.deleted_at
    into v_codice, v_unita_anagrafica, v_categoria, v_deleted
  from public.materie_prime mp
  where mp.id = p_prodotto_id;

  if v_codice is null or v_deleted is not null then
    raise exception 'Materia prima non trovata.';
  end if;
  if v_categoria = 'acquisti_occasionali' then
    raise exception 'Articolo in acquisti occasionali: non si registra un movimento di magazzino.';
  end if;

  v_unita_anagrafica := lower(btrim(coalesce(v_unita_anagrafica, '')));
  if v_unita_anagrafica not in ('kg', 'g', 'lt', 'ml', 'pz') then
    raise exception 'Unità di misura assente in anagrafica. Impostala prima di registrare il movimento.';
  end if;
  if v_unita is distinct from v_unita_anagrafica then
    raise exception
      'Unità % diversa da quella di anagrafica (%). Nessuna conversione è stata applicata.',
      v_unita, v_unita_anagrafica;
  end if;

  select g.id, g.quantita_kg, g.unita, g.is_test
    into v_giacenza, v_saldo, v_unita_giacenza, v_test
  from public.magazzino_giacenze g
  where g.catalog_kind = 'materia_prima'
    and g.prodotto_id = p_prodotto_id
    and g.deleted_at is null
  for update;

  if v_test is true then
    raise exception 'La giacenza di test non si movimenta da questa operazione.';
  end if;

  if v_giacenza is not null and v_unita_giacenza is distinct from v_unita_anagrafica then
    raise exception
      'La giacenza è in % e l''anagrafica in %. Il movimento è rifiutato, senza conversione.',
      v_unita_giacenza, v_unita_anagrafica;
  end if;

  if v_tipo = 'scarico' and coalesce(v_saldo, 0) < v_qty then
    raise exception
      'Giacenza insufficiente: disponibili % %, richiesti % %.',
      coalesce(v_saldo, 0), v_unita_anagrafica, v_qty, v_unita_anagrafica;
  end if;

  if v_tipo = 'carico' then
    v_dopo := round(coalesce(v_saldo, 0) + v_qty, 3);
  else
    v_dopo := round(coalesce(v_saldo, 0) - v_qty, 3);
  end if;
  if v_dopo < 0 then
    raise exception
      'Giacenza insufficiente: disponibili % %, richiesti % %.',
      coalesce(v_saldo, 0), v_unita_anagrafica, v_qty, v_unita_anagrafica;
  end if;

  insert into public.magazzino_movimenti (
      catalog_kind, prodotto_id, prodotto_codice, tipo, quantita_kg, unita,
      barcode_letto, riferimento, note, chiave_idempotenza, is_test,
      created_by, updated_by
    ) values (
      'materia_prima', p_prodotto_id, v_codice, v_tipo, v_qty, v_unita,
      left(btrim(coalesce(p_barcode, '')), 128), 'movimento-mp',
      left(btrim(coalesce(p_note, '')), 500), v_chiave, false, v_uid, v_uid
    )
    returning id into v_mov;

    if v_giacenza is null then
      insert into public.magazzino_giacenze (
        catalog_kind, prodotto_id, prodotto_codice, quantita_kg, unita,
        is_test, created_by, updated_by
      ) values (
        'materia_prima', p_prodotto_id, v_codice, v_dopo, v_unita,
        false, v_uid, v_uid
      )
      returning id into v_giacenza;
    else
      update public.magazzino_giacenze
        set quantita_kg = v_dopo,
            updated_by = v_uid
      where id = v_giacenza;
    end if;

  insert into public.audit_log (entity_type, entity_id, action, actor_id, summary, payload)
  values (
    'magazzino_movimenti',
    v_mov,
    'create',
    v_uid,
    case
      when v_tipo = 'carico' then 'Carico materia prima ' || v_qty || ' ' || v_unita || ' · ' || v_codice
      else 'Scarico materia prima ' || v_qty || ' ' || v_unita || ' · ' || v_codice
    end,
    jsonb_build_object(
      'prodotto_id', p_prodotto_id,
      'tipo', v_tipo,
      'quantita', v_qty,
      'unita', v_unita,
      'saldo_prima', coalesce(v_saldo, 0),
      'saldo_dopo', v_dopo,
      'chiave', v_chiave
    )
  );

  return jsonb_build_object(
    'movimento_id', v_mov,
    'giacenza_id', v_giacenza,
    'saldo', v_dopo,
    'unita', v_unita,
    'ripetuta', false
  );
end;
$$;

revoke all on function public.magazzino_mp_registra_movimento(uuid, text, numeric, text, text, text, text)
  from public, anon;
grant execute on function public.magazzino_mp_registra_movimento(uuid, text, numeric, text, text, text, text)
  to authenticated;

reset role;

set local role magazzino_mp_pulizia;

create or replace function public.magazzino_mp_pulisci_test(p_chiave text)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_uid uuid;
  v_chiave text;
  v_esito jsonb;
  v_id uuid;
  v_movimenti integer := 0;
  v_giacenze integer := 0;
  v_lasciati integer := 0;
begin
  v_uid := public.app_effective_uid();
  if v_uid is null then
    raise exception 'Accesso non autenticato.';
  end if;
  if not (
    public.is_superadmin()
    or public.has_area_access('amministrazione')
  ) then
    raise exception 'Non autorizzato a pulire i dati di test delle materie prime.';
  end if;

  v_chiave := btrim(coalesce(p_chiave, ''));
  if char_length(v_chiave) < 8 or char_length(v_chiave) > 200 then
    raise exception 'Chiave operazione non valida.';
  end if;

  perform pg_advisory_xact_lock(hashtextextended('mp-pulizia:' || v_chiave, 0));

  select o.esito into v_esito
  from public.magazzino_mp_operazioni o
  where o.chiave = v_chiave;
  if v_esito is not null then
    return v_esito || jsonb_build_object('ripetuta', true);
  end if;

  perform pg_advisory_xact_lock(hashtextextended('mp-pulizia-righe', 0));

  select count(*) into v_lasciati
  from public.magazzino_movimenti m
  where m.catalog_kind = 'materia_prima'
    and m.is_test
    and m.deleted_at is null
    and exists (
      select 1 from public.magazzino_giacenze g
      where g.catalog_kind = 'materia_prima'
        and g.prodotto_id = m.prodotto_id
        and g.deleted_at is null
        and g.is_test = false
    );

  with chiusi as (
      update public.magazzino_movimenti m
        set deleted_at = now(),
            deleted_by = v_uid,
            updated_by = v_uid
      where m.catalog_kind = 'materia_prima'
        and m.is_test
        and m.deleted_at is null
        and not exists (
          select 1 from public.magazzino_giacenze g
          where g.catalog_kind = 'materia_prima'
            and g.prodotto_id = m.prodotto_id
            and g.deleted_at is null
            and g.is_test = false
        )
      returning 1
    )
    select count(*) into v_movimenti from chiusi;

    with chiuse as (
      update public.magazzino_giacenze g
        set deleted_at = now(),
            deleted_by = v_uid,
            updated_by = v_uid
      where g.catalog_kind = 'materia_prima'
        and g.is_test
        and g.deleted_at is null
      returning 1
    )
    select count(*) into v_giacenze from chiuse;

  v_esito := jsonb_build_object(
    'movimenti', v_movimenti,
    'giacenze', v_giacenze,
    'lasciati', v_lasciati,
    'ripetuta', false
  );

  insert into public.magazzino_mp_operazioni (chiave, tipo, esito, created_by)
  values (v_chiave, 'pulizia_test', v_esito, v_uid)
  returning id into v_id;

  insert into public.audit_log (entity_type, entity_id, action, actor_id, summary, payload)
  values (
    'magazzino_mp_operazioni', v_id, 'soft_delete', v_uid,
    'Pulizia dati di test del magazzino materie prime', v_esito
  );

  return v_esito;
end;
$$;

revoke all on function public.magazzino_mp_pulisci_test(text) from public, anon;
grant execute on function public.magazzino_mp_pulisci_test(text) to authenticated;

reset role;

do $$
declare
  cname text;
begin
  for cname in
    select con.conname
    from pg_constraint con
    where con.conrelid = 'public.magazzino_note_acquisto_righe'::regclass
      and con.contype = 'c'
      and pg_get_constraintdef(con.oid) ilike '%unita%'
  loop
    execute format(
      'alter table public.magazzino_note_acquisto_righe drop constraint %I',
      cname
    );
  end loop;
end $$;

alter table public.magazzino_note_acquisto_righe
  drop constraint if exists magazzino_note_acquisto_righe_unita_check;
alter table public.magazzino_note_acquisto_righe
  add constraint magazzino_note_acquisto_righe_unita_check
  check (unita in ('kg', 'g', 'lt', 'ml', 'pz'));

comment on constraint magazzino_note_acquisto_righe_unita_check
  on public.magazzino_note_acquisto_righe is
  'Nota interna di riordino. Stesse unità dell''anagrafica materie prime, senza conversione. Non è un ordine di approvvigionamento.';

do $$
begin
  if current_user in ('anon', 'authenticated', 'service_role', 'authenticator') then
    raise exception 'La proprietà del registro non si assegna da un ruolo client.';
  end if;
end $$;

-- PostgreSQL permette di assegnare la proprietà di una funzione solo a un ruolo
-- che può creare oggetti nello schema. Il ruolo non ha login.
grant usage, create on schema public to magazzino_mp_movimento;
grant usage, create on schema public to magazzino_mp_pulizia;

-- Solo il ruolo che applica le migrazioni diventa membro, perché PostgreSQL
-- esige di poter assumere il ruolo di destinazione. I ruoli del client restano fuori.
grant magazzino_mp_movimento to current_user;
grant magazzino_mp_pulizia to current_user;

alter function public.magazzino_mp_registra_movimento(uuid, text, numeric, text, text, text, text)
  owner to magazzino_mp_movimento;
alter function public.magazzino_mp_pulisci_test(text)
  owner to magazzino_mp_pulizia;

comment on role magazzino_mp_movimento is
  'Proprietario della sola registrazione movimenti materie prime. Nessun login, nessuna membership client.';
comment on role magazzino_mp_pulizia is
  'Proprietario della sola pulizia test materie prime. Non può cambiare i saldi.';
