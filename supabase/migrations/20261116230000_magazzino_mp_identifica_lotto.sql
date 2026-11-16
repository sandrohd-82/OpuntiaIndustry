-- Identificazione dei lotti su una riga di carico arrivata.
-- Non accetta, non blocca, non respinge, non muove la giacenza e non apre fogli HACCP.
-- Il ruolo non è quello del registro movimenti e non riceve i suoi privilegi.

do $$
begin
  if current_user in ('anon', 'authenticated', 'service_role', 'authenticator') then
    raise exception 'La proprietà dell''identificazione non si assegna da un ruolo client.';
  end if;
  if not exists (select 1 from pg_roles where rolname = 'magazzino_mp_identificazione') then
    create role magazzino_mp_identificazione nologin noinherit;
  end if;
end $$;

revoke magazzino_mp_identificazione from anon, authenticated, service_role, authenticator;
grant magazzino_mp_identificazione to current_user;
grant usage on schema public to magazzino_mp_identificazione;

grant select, insert on public.magazzino_mp_lotti to magazzino_mp_identificazione;
grant select, insert on public.magazzino_mp_lotto_eventi to magazzino_mp_identificazione;
grant select on public.materie_prime to magazzino_mp_identificazione;
grant select on public.approvvigionamenti_carichi to magazzino_mp_identificazione;
grant select on public.approvvigionamenti_carichi_righe to magazzino_mp_identificazione;
grant select on public.haccp_fogli_ingresso to magazzino_mp_identificazione;
grant select on public.magazzino_ubicazioni to magazzino_mp_identificazione;
grant insert on public.audit_log to magazzino_mp_identificazione;
grant usage, select on sequence public.magazzino_mp_lotti_seq to magazzino_mp_identificazione;
grant execute on function public.app_effective_uid() to magazzino_mp_identificazione;
grant execute on function public.is_superadmin() to magazzino_mp_identificazione;
grant execute on function public.has_area_access(text) to magazzino_mp_identificazione;
grant execute on function public.magazzino_mp_lotto_conti(uuid) to magazzino_mp_identificazione;
grant execute on function public.magazzino_mp_evento_delta(text, numeric, text, text, smallint, uuid)
  to magazzino_mp_identificazione;

drop policy if exists "magazzino_mp_lotti_identificazione_sel" on public.magazzino_mp_lotti;
create policy "magazzino_mp_lotti_identificazione_sel"
  on public.magazzino_mp_lotti for select
  to magazzino_mp_identificazione
  using (true);

drop policy if exists "magazzino_mp_lotti_identificazione_ins" on public.magazzino_mp_lotti;
create policy "magazzino_mp_lotti_identificazione_ins"
  on public.magazzino_mp_lotti for insert
  to magazzino_mp_identificazione
  with check (
    deleted_at is null
    and is_test = false
    and carico_riga_id is not null
    and haccp_foglio_id is not null
    and foglio_ingresso_mp_id is null
  );

drop policy if exists "magazzino_mp_lotto_eventi_identificazione_sel" on public.magazzino_mp_lotto_eventi;
create policy "magazzino_mp_lotto_eventi_identificazione_sel"
  on public.magazzino_mp_lotto_eventi for select
  to magazzino_mp_identificazione
  using (true);

drop policy if exists "magazzino_mp_lotto_eventi_identificazione_ins" on public.magazzino_mp_lotto_eventi;
create policy "magazzino_mp_lotto_eventi_identificazione_ins"
  on public.magazzino_mp_lotto_eventi for insert
  to magazzino_mp_identificazione
  with check (
    tipo = 'identificazione'
    and a_stato = 'in_controllo'
    and da_stato is null
    and segno is null
    and sottotipo is null
    and evento_riferimento_id is null
    and movimento_id is null
  );

drop policy if exists "materie_prime_mp_identificazione_sel" on public.materie_prime;
create policy "materie_prime_mp_identificazione_sel"
  on public.materie_prime for select
  to magazzino_mp_identificazione
  using (deleted_at is null);

drop policy if exists "approvvigionamenti_carichi_mp_identificazione_sel" on public.approvvigionamenti_carichi;
create policy "approvvigionamenti_carichi_mp_identificazione_sel"
  on public.approvvigionamenti_carichi for select
  to magazzino_mp_identificazione
  using (deleted_at is null);

drop policy if exists "approvvigionamenti_carichi_righe_mp_identificazione_sel"
  on public.approvvigionamenti_carichi_righe;
create policy "approvvigionamenti_carichi_righe_mp_identificazione_sel"
  on public.approvvigionamenti_carichi_righe for select
  to magazzino_mp_identificazione
  using (true);

drop policy if exists "haccp_fogli_ingresso_mp_identificazione_sel" on public.haccp_fogli_ingresso;
create policy "haccp_fogli_ingresso_mp_identificazione_sel"
  on public.haccp_fogli_ingresso for select
  to magazzino_mp_identificazione
  using (deleted_at is null);

drop policy if exists "magazzino_ubicazioni_mp_identificazione_sel" on public.magazzino_ubicazioni;
create policy "magazzino_ubicazioni_mp_identificazione_sel"
  on public.magazzino_ubicazioni for select
  to magazzino_mp_identificazione
  using (deleted_at is null);

drop policy if exists "audit_log_insert_mp_identificazione" on public.audit_log;
create policy "audit_log_insert_mp_identificazione"
  on public.audit_log for insert
  to magazzino_mp_identificazione
  with check (entity_type = 'magazzino_mp_lotti' and action = 'create');

grant usage, create on schema public to magazzino_mp_identificazione;

set local role magazzino_mp_identificazione;

create or replace function public.magazzino_mp_identifica_lotto(
  p_carico_riga_id uuid,
  p_quantita numeric,
  p_chiave text,
  p_codice_fornitore text default null,
  p_ddt_numero text default null,
  p_ddt_data date default null,
  p_ubicazione_id uuid default null
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_uid uuid;
  v_chiave text;
  v_qty numeric(14, 3);
  v_codice_fornitore text;
  v_ddt text;
  v_unita text;
  v_unita_riga text;
  v_materia uuid;
  v_fornitore uuid;
  v_foglio uuid;
  v_stato text;
  v_deleted timestamptz;
  v_arrivata numeric;
  v_data date;
  v_occupata numeric;
  v_codice text;
  v_id uuid;
  v_evento_tipo text;
  v_evento_qty numeric;
  v_evento_unita text;
  v_evento_a text;
  v_lotto_codice text;
  v_lotto_riga uuid;
  v_lotto_fornitore_codice text;
  v_lotto_unita text;
  v_lotto_ddt text;
  v_lotto_ddt_data date;
  v_lotto_ubicazione uuid;
  v_lotto_deleted timestamptz;
  v_ic numeric;
  v_di numeric;
  v_ident numeric;
  v_altri numeric;
  v_giro integer;
begin
  v_uid := public.app_effective_uid();
  if v_uid is null then
    raise exception 'Accesso non autenticato.';
  end if;
  if not (
    public.is_superadmin()
    or public.has_area_access('magazzino')
    or public.has_area_access('produzione')
  ) then
    raise exception 'Non autorizzato a identificare lotti.';
  end if;

  v_chiave := btrim(coalesce(p_chiave, ''));
  if char_length(v_chiave) < 8 or char_length(v_chiave) > 200 then
    raise exception 'Chiave idempotente non valida.';
  end if;
  if p_quantita is null or p_quantita <= 0 or p_quantita > 1000000
     or p_quantita <> round(p_quantita, 3) then
    raise exception 'Quantità non valida.';
  end if;
  v_qty := p_quantita;
  v_codice_fornitore := nullif(btrim(coalesce(p_codice_fornitore, '')), '');
  if v_codice_fornitore is not null and char_length(v_codice_fornitore) > 40 then
    raise exception 'Codice fornitore non valido.';
  end if;
  v_ddt := nullif(btrim(coalesce(p_ddt_numero, '')), '');
  if v_ddt is not null and char_length(v_ddt) > 40 then
    raise exception 'Numero DDT non valido.';
  end if;

  -- Prima la chiave, poi l'origine della riga. Il trigger del lotto ripete l'origine
  -- e solo dopo blocca il lotto nuovo. Non si blocca l'articolo di magazzino.
  perform pg_advisory_xact_lock(hashtextextended('mp-lotto-chiave:' || v_chiave, 0));

  select e.tipo, e.quantita, e.unita, e.a_stato,
         l.id, l.codice, l.carico_riga_id, l.codice_fornitore, l.unita,
         l.ddt_numero, l.ddt_data, l.ubicazione_id, l.deleted_at
    into v_evento_tipo, v_evento_qty, v_evento_unita, v_evento_a,
         v_id, v_lotto_codice, v_lotto_riga, v_lotto_fornitore_codice, v_lotto_unita,
         v_lotto_ddt, v_lotto_ddt_data, v_lotto_ubicazione, v_lotto_deleted
  from public.magazzino_mp_lotto_eventi e
  join public.magazzino_mp_lotti l on l.id = e.lotto_id
  where e.chiave = v_chiave;

  if v_id is not null then
    if v_lotto_deleted is not null
       or v_evento_tipo is distinct from 'identificazione'
       or v_evento_a is distinct from 'in_controllo'
       or v_evento_qty is distinct from v_qty
       or v_evento_unita is distinct from v_lotto_unita
       or v_lotto_riga is distinct from p_carico_riga_id
       or lower(btrim(coalesce(v_lotto_fornitore_codice, '')))
            is distinct from lower(coalesce(v_codice_fornitore, ''))
       or v_lotto_ddt is distinct from v_ddt
       or v_lotto_ddt_data is distinct from p_ddt_data
       or v_lotto_ubicazione is distinct from p_ubicazione_id then
      raise exception 'La chiave idempotente è già usata con dati diversi.';
    end if;
    return jsonb_build_object(
      'id', v_id,
      'codice', v_lotto_codice,
      'riusata', true,
      'stato', 'in_controllo'
    );
  end if;

  perform pg_advisory_xact_lock(hashtextextended(
    'mp-lotto-origine:' || p_carico_riga_id::text, 0
  ));

  select r.materia_prima_id, lower(btrim(coalesce(r.unita_misura, ''))), r.quantita_arrivata,
         c.fornitore_id, c.stato, c.foglio_id, c.deleted_at, c.data_effettiva
    into v_materia, v_unita_riga, v_arrivata, v_fornitore, v_stato, v_foglio, v_deleted, v_data
  from public.approvvigionamenti_carichi_righe r
  join public.approvvigionamenti_carichi c on c.id = r.carico_id
  where r.id = p_carico_riga_id;

  if v_materia is null or v_deleted is not null then
    raise exception 'Riga di carico non disponibile.';
  end if;
  if v_stato not in ('parziale', 'arrivato') or v_data is null then
    raise exception 'Il carico non ha un arrivo fisico.';
  end if;
  if v_arrivata is null then
    raise exception 'La riga non ha una quantità arrivata.';
  end if;
  if v_foglio is null or not exists (
    select 1
    from public.haccp_fogli_ingresso f
    where f.id = v_foglio
      and f.deleted_at is null
  ) then
    raise exception 'Il carico non ha un foglio HACCP.';
  end if;

  select lower(btrim(coalesce(mp.unita_misura, '')))
    into v_unita
  from public.materie_prime mp
  where mp.id = v_materia
    and mp.deleted_at is null;
  if v_unita is null or v_unita = '' or v_unita <> v_unita_riga
     or v_unita not in ('kg', 'g', 'lt', 'ml', 'pz') then
    raise exception 'L''unità della riga non coincide con l''anagrafica.';
  end if;

  if p_ubicazione_id is not null and not exists (
    select 1
    from public.magazzino_ubicazioni u
    where u.id = p_ubicazione_id
      and u.deleted_at is null
  ) then
    raise exception 'Ubicazione non disponibile.';
  end if;

  if v_codice_fornitore is not null and exists (
    select 1
    from public.magazzino_mp_lotti l
    where l.carico_riga_id = p_carico_riga_id
      and l.deleted_at is null
      and lower(btrim(l.codice_fornitore)) = lower(v_codice_fornitore)
  ) then
    raise exception 'Codice fornitore già usato sulla riga.';
  end if;

  select coalesce(sum(c.identificata + c.rettifica), 0)
    into v_occupata
  from public.magazzino_mp_lotti l
  cross join lateral public.magazzino_mp_lotto_conti(l.id) c
  where l.deleted_at is null
    and l.carico_riga_id = p_carico_riga_id;
  if v_occupata + v_qty > v_arrivata then
    raise exception 'La quantità identificata supera la quantità arrivata.';
  end if;

  v_codice := null;
  for v_giro in 1..5 loop
    v_codice := 'LM-'
      || to_char(now() at time zone 'Europe/Rome', 'YY')
      || '-'
      || lpad(nextval('public.magazzino_mp_lotti_seq')::text, 4, '0');
    exit when not exists (
      select 1 from public.magazzino_mp_lotti l where l.codice = v_codice
    );
    v_codice := null;
  end loop;
  if v_codice is null then
    raise exception 'Codice lotto non disponibile.';
  end if;

  insert into public.magazzino_mp_lotti (
    codice, materia_prima_id, fornitore_id, unita, codice_fornitore,
    carico_riga_id, haccp_foglio_id, ddt_numero, ddt_data, ubicazione_id,
    created_by, updated_by
  ) values (
    v_codice, v_materia, v_fornitore, v_unita, v_codice_fornitore,
    p_carico_riga_id, v_foglio, v_ddt, p_ddt_data, p_ubicazione_id,
    v_uid, v_uid
  )
  returning id into v_id;

  insert into public.magazzino_mp_lotto_eventi (
    lotto_id, tipo, quantita, unita, a_stato, chiave, created_by, updated_by
  ) values (
    v_id, 'identificazione', v_qty, v_unita, 'in_controllo', v_chiave, v_uid, v_uid
  );

  select c.identificata, c.in_controllo, c.disponibile,
         c.bloccata + c.respinta_presente + c.respinta_uscita + c.consumata_uscita
    into v_ident, v_ic, v_di, v_altri
  from public.magazzino_mp_lotto_conti(v_id) c;
  if v_ident <> v_qty or v_ic <> v_qty or v_di <> 0 or v_altri <> 0 then
    raise exception 'Il lotto non è rimasto interamente in controllo.';
  end if;

  insert into public.audit_log (entity_type, entity_id, action, actor_id, summary, payload)
  values (
    'magazzino_mp_lotti',
    v_id,
    'create',
    v_uid,
    'Identificazione lotto ' || v_codice || ' · ' || v_qty || ' ' || v_unita,
    jsonb_build_object(
      'lotto_id', v_id,
      'codice', v_codice,
      'carico_riga_id', p_carico_riga_id,
      'haccp_foglio_id', v_foglio,
      'materia_prima_id', v_materia,
      'fornitore_id', v_fornitore,
      'quantita', v_qty,
      'unita', v_unita,
      'chiave', v_chiave
    )
  );

  return jsonb_build_object(
    'id', v_id,
    'codice', v_codice,
    'riusata', false,
    'stato', 'in_controllo'
  );
end;
$$;

reset role;

revoke create on schema public from magazzino_mp_identificazione;

revoke all on function public.magazzino_mp_identifica_lotto(uuid, numeric, text, text, text, date, uuid)
  from public, anon, authenticated, service_role;
grant execute on function public.magazzino_mp_identifica_lotto(uuid, numeric, text, text, text, date, uuid)
  to authenticated;

comment on role magazzino_mp_identificazione is
  'Proprietario della sola identificazione lotti su carichi arrivati. Nessun login e nessun movimento di giacenza.';

comment on function public.magazzino_mp_identifica_lotto(uuid, numeric, text, text, text, date, uuid) is
  'Crea identità ed evento di identificazione sulla riga arrivata, usando il foglio HACCP già collegato. Non modifica la giacenza.';

do $$
begin
  if has_schema_privilege('magazzino_mp_identificazione', 'public', 'CREATE') then
    raise exception 'Il ruolo di identificazione non deve creare oggetti.';
  end if;
  if not has_schema_privilege('magazzino_mp_identificazione', 'public', 'USAGE') then
    raise exception 'Manca l''uso dello schema per l''identificazione.';
  end if;
  if has_table_privilege('magazzino_mp_identificazione', 'public.magazzino_giacenze', 'UPDATE')
     or has_table_privilege('magazzino_mp_identificazione', 'public.magazzino_movimenti', 'INSERT')
     or has_table_privilege('authenticated', 'public.magazzino_mp_lotti', 'INSERT')
     or has_table_privilege('authenticated', 'public.magazzino_mp_lotto_eventi', 'INSERT') then
    raise exception 'Privilegi di identificazione troppo ampi.';
  end if;
  if (
    select r.rolname
    from pg_proc p
    join pg_roles r on r.oid = p.proowner
    where p.proname = 'magazzino_mp_identifica_lotto'
      and p.pronargs = 7
  ) is distinct from 'magazzino_mp_identificazione' then
    raise exception 'Proprietario della funzione inatteso.';
  end if;
end $$;
