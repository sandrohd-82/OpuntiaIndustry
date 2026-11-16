-- Accettazione e prelievo dei lotti LM- già identificati.
-- Non sostituisce il registro pubblico, non numera un secondo lotto
-- e non considera conforme un controllo HACCP mancante o non conforme.
-- Una deroga non autorizza l'accettazione.

create or replace view public.approvvigionamenti_pronti_identificazione
with (security_invoker = true) as
select
  c.id as carico_id,
  c.codice as carico_codice,
  c.fornitore_id,
  c.stato as carico_stato,
  c.foglio_id,
  f.codice as foglio_codice,
  f.stato as foglio_stato,
  r.materia_prima_id,
  r.quantita_prevista,
  r.quantita_arrivata,
  r.unita_misura,
  d.numero as ddt_numero,
  d.data_documento as ddt_data,
  (
    select btrim(ris.valore->>'codice')
    from public.haccp_fogli_ingresso_risposte ris
    where ris.foglio_id = c.foglio_id
      and ris.voce_codice = '2e'
    order by ris.confermata_at desc
    limit 1
  ) as lotto_dichiarato,
  r.id as carico_riga_id,
  r.codice as riga_codice,
  r.nome as riga_nome
from public.approvvigionamenti_carichi c
join public.haccp_fogli_ingresso f on f.id = c.foglio_id
join public.approvvigionamenti_carichi_righe r on r.carico_id = c.id
left join public.approvvigionamenti_ddt d
  on d.carico_id = c.id
 and d.deleted_at is null
where c.deleted_at is null
  and f.deleted_at is null;

comment on view public.approvvigionamenti_pronti_identificazione is
  'Righe arrivate da identificare. Non crea un lotto LM- e non carica la giacenza.';

create or replace function public.magazzino_giacenze_proteggi_mp()
returns trigger
language plpgsql
security invoker
set search_path = public
as $$
declare
  v_movimento boolean := current_user = 'magazzino_mp_movimento';
  v_collegamento boolean := current_user = 'magazzino_mp_collegamento';
  v_quantita boolean := v_movimento or v_collegamento;
  v_pulizia boolean := current_user = 'magazzino_mp_pulizia';
begin
  if tg_op = 'DELETE' then
    if old.catalog_kind = 'materia_prima' then
      raise exception 'La giacenza di una materia prima non si cancella fisicamente.';
    end if;
    return old;
  end if;

  if tg_op = 'INSERT' then
    if new.catalog_kind = 'materia_prima' and new.quantita_kg <> 0 and not v_quantita then
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

  if new.quantita_kg is distinct from old.quantita_kg and not v_quantita then
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
  v_collegamento boolean := current_user = 'magazzino_mp_collegamento';
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
      if not (
        v_collegamento
        and new.lotto_evento_id is not null
        and new.registro_classe = 'lotto'
        and new.is_test is false
      ) then
        raise exception 'Il movimento di materia prima si registra solo con l''operazione di magazzino.';
      end if;
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
    if old.lotto_evento_id is not null or old.registro_classe = 'lotto' then
      raise exception 'Un movimento collegato a un lotto non si chiude.';
    end if;
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

do $$
begin
  if current_user in ('anon', 'authenticated', 'service_role', 'authenticator') then
    raise exception 'La proprietà del collegamento non si assegna da un ruolo client.';
  end if;
  if not exists (select 1 from pg_roles where rolname = 'magazzino_mp_collegamento') then
    create role magazzino_mp_collegamento nologin noinherit;
  end if;
end $$;

revoke magazzino_mp_collegamento from anon, authenticated, service_role, authenticator;
grant magazzino_mp_collegamento to current_user;
grant usage on schema public to magazzino_mp_collegamento;

grant select on public.magazzino_mp_lotti to magazzino_mp_collegamento;
grant select, insert on public.magazzino_mp_lotto_eventi to magazzino_mp_collegamento;
grant select on public.haccp_fogli_ingresso to magazzino_mp_collegamento;
grant select on public.haccp_fogli_ingresso_risposte to magazzino_mp_collegamento;
grant select on public.approvvigionamenti_carichi_righe to magazzino_mp_collegamento;
grant select on public.materie_prime to magazzino_mp_collegamento;
grant select, insert, update on public.magazzino_giacenze to magazzino_mp_collegamento;
grant select, insert on public.magazzino_movimenti to magazzino_mp_collegamento;
grant select on public.produzione_fogli_lavorazione to magazzino_mp_collegamento;
grant insert on public.audit_log to magazzino_mp_collegamento;
grant execute on function public.app_effective_uid() to magazzino_mp_collegamento;
grant execute on function public.is_superadmin() to magazzino_mp_collegamento;
grant execute on function public.has_area_access(text) to magazzino_mp_collegamento;
grant execute on function public.magazzino_mp_lotto_conti(uuid) to magazzino_mp_collegamento;
grant execute on function public.magazzino_mp_evento_delta(text, numeric, text, text, smallint, uuid)
  to magazzino_mp_collegamento;

drop policy if exists "magazzino_mp_lotti_collegamento_sel" on public.magazzino_mp_lotti;
create policy "magazzino_mp_lotti_collegamento_sel"
  on public.magazzino_mp_lotti for select to magazzino_mp_collegamento
  using (deleted_at is null);

drop policy if exists "magazzino_mp_lotto_eventi_collegamento_sel" on public.magazzino_mp_lotto_eventi;
create policy "magazzino_mp_lotto_eventi_collegamento_sel"
  on public.magazzino_mp_lotto_eventi for select to magazzino_mp_collegamento
  using (true);

drop policy if exists "magazzino_mp_lotto_eventi_collegamento_ins" on public.magazzino_mp_lotto_eventi;
create policy "magazzino_mp_lotto_eventi_collegamento_ins"
  on public.magazzino_mp_lotto_eventi for insert to magazzino_mp_collegamento
  with check (
    movimento_id is null
    and evento_riferimento_id is null
    and segno is null
    and (
      (
        tipo = 'accettazione'
        and da_stato = 'in_controllo'
        and a_stato = 'disponibile'
        and sottotipo is null
      )
      or (
        tipo = 'consumo_uscita'
        and da_stato = 'disponibile'
        and a_stato = 'consumata_uscita'
        and sottotipo = 'prelievo'
      )
    )
  );

drop policy if exists "haccp_fogli_ingresso_mp_collegamento_sel" on public.haccp_fogli_ingresso;
create policy "haccp_fogli_ingresso_mp_collegamento_sel"
  on public.haccp_fogli_ingresso for select to magazzino_mp_collegamento
  using (deleted_at is null);

drop policy if exists "haccp_fogli_ingresso_risposte_mp_collegamento_sel"
  on public.haccp_fogli_ingresso_risposte;
create policy "haccp_fogli_ingresso_risposte_mp_collegamento_sel"
  on public.haccp_fogli_ingresso_risposte for select to magazzino_mp_collegamento
  using (true);

drop policy if exists "approvvigionamenti_carichi_righe_mp_collegamento_sel"
  on public.approvvigionamenti_carichi_righe;
create policy "approvvigionamenti_carichi_righe_mp_collegamento_sel"
  on public.approvvigionamenti_carichi_righe for select to magazzino_mp_collegamento
  using (true);

drop policy if exists "materie_prime_mp_collegamento_sel" on public.materie_prime;
create policy "materie_prime_mp_collegamento_sel"
  on public.materie_prime for select to magazzino_mp_collegamento
  using (deleted_at is null);

drop policy if exists "magazzino_giacenze_mp_collegamento_sel" on public.magazzino_giacenze;
create policy "magazzino_giacenze_mp_collegamento_sel"
  on public.magazzino_giacenze for select to magazzino_mp_collegamento
  using (catalog_kind = 'materia_prima' and deleted_at is null and is_test is false);

drop policy if exists "magazzino_giacenze_mp_collegamento_ins" on public.magazzino_giacenze;
create policy "magazzino_giacenze_mp_collegamento_ins"
  on public.magazzino_giacenze for insert to magazzino_mp_collegamento
  with check (catalog_kind = 'materia_prima' and is_test is false and deleted_at is null);

drop policy if exists "magazzino_giacenze_mp_collegamento_upd" on public.magazzino_giacenze;
create policy "magazzino_giacenze_mp_collegamento_upd"
  on public.magazzino_giacenze for update to magazzino_mp_collegamento
  using (catalog_kind = 'materia_prima' and is_test is false and deleted_at is null)
  with check (catalog_kind = 'materia_prima' and is_test is false and deleted_at is null);

drop policy if exists "magazzino_movimenti_mp_collegamento_sel" on public.magazzino_movimenti;
create policy "magazzino_movimenti_mp_collegamento_sel"
  on public.magazzino_movimenti for select to magazzino_mp_collegamento
  using (catalog_kind = 'materia_prima' and deleted_at is null);

drop policy if exists "magazzino_movimenti_mp_collegamento_ins" on public.magazzino_movimenti;
create policy "magazzino_movimenti_mp_collegamento_ins"
  on public.magazzino_movimenti for insert to magazzino_mp_collegamento
  with check (
    catalog_kind = 'materia_prima'
    and registro_classe = 'lotto'
    and lotto_evento_id is not null
    and is_test is false
    and deleted_at is null
    and tipo in ('carico', 'scarico')
  );

drop policy if exists "produzione_fogli_lavorazione_mp_collegamento_sel"
  on public.produzione_fogli_lavorazione;
create policy "produzione_fogli_lavorazione_mp_collegamento_sel"
  on public.produzione_fogli_lavorazione for select to magazzino_mp_collegamento
  using (deleted_at is null);

drop policy if exists "audit_log_insert_mp_collegamento" on public.audit_log;
create policy "audit_log_insert_mp_collegamento"
  on public.audit_log for insert to magazzino_mp_collegamento
  with check (entity_type = 'magazzino_mp_lotti' and action = 'create');

grant usage, create on schema public to magazzino_mp_collegamento;
set local role magazzino_mp_collegamento;

create or replace function public.magazzino_mp_accetta_lotto(
  p_lotto_id uuid,
  p_quantita numeric,
  p_chiave text
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
  v_unita text;
  v_materia uuid;
  v_foglio uuid;
  v_origine text;
  v_codice text;
  v_deleted timestamptz;
  v_evento uuid;
  v_evento_tipo text;
  v_evento_qty numeric;
  v_evento_lotto uuid;
  v_mov uuid;
  v_mov_tipo text;
  v_mov_qty numeric;
  v_mov_prodotto uuid;
  v_conto numeric;
  v_stato_foglio text;
  v_esiti integer;
  v_codice_mp text;
  v_unita_mp text;
  v_categoria text;
  v_giacenza uuid;
  v_saldo numeric(14, 3);
  v_unita_giacenza text;
  v_test boolean;
  v_dopo numeric(14, 3);
  v_disponibile numeric;
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
    raise exception 'Non autorizzato ad accettare il lotto.';
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

  perform pg_advisory_xact_lock(hashtextextended('mp-lotto-chiave:' || v_chiave, 0));
  perform pg_advisory_xact_lock(hashtextextended('mp-chiave:' || v_chiave, 0));

  select e.id, e.tipo, e.quantita, e.lotto_id
    into v_evento, v_evento_tipo, v_evento_qty, v_evento_lotto
  from public.magazzino_mp_lotto_eventi e
  where e.chiave = v_chiave;
  if v_evento is not null then
    select m.id, m.tipo, m.quantita_kg, m.prodotto_id
      into v_mov, v_mov_tipo, v_mov_qty, v_mov_prodotto
    from public.magazzino_movimenti m
    where m.lotto_evento_id = v_evento
      and m.deleted_at is null;
    if v_evento_tipo is distinct from 'accettazione'
       or v_evento_qty is distinct from v_qty
       or v_evento_lotto is distinct from p_lotto_id
       or v_mov is null
       or v_mov_tipo is distinct from 'carico'
       or v_mov_qty is distinct from v_qty then
      raise exception 'La chiave idempotente è già usata con dati diversi.';
    end if;
    return jsonb_build_object(
      'evento_id', v_evento,
      'movimento_id', v_mov,
      'lotto_id', p_lotto_id,
      'riusata', true
    );
  end if;
  if exists (
    select 1 from public.magazzino_movimenti m
    where m.catalog_kind = 'materia_prima'
      and m.chiave_idempotenza = v_chiave
      and m.deleted_at is null
  ) then
    raise exception 'La chiave idempotente è già usata con dati diversi.';
  end if;

  select l.unita, l.materia_prima_id, l.haccp_foglio_id, l.codice, l.deleted_at,
         coalesce(l.carico_riga_id::text, l.foglio_ingresso_mp_id::text)
    into v_unita, v_materia, v_foglio, v_codice, v_deleted, v_origine
  from public.magazzino_mp_lotti l
  where l.id = p_lotto_id;
  if v_unita is null or v_deleted is not null or v_origine is null then
    raise exception 'Lotto non disponibile.';
  end if;
  if v_foglio is null then
    raise exception 'Il lotto non ha il foglio HACCP di ingresso.';
  end if;

  perform pg_advisory_xact_lock(hashtextextended('mp-lotto-origine:' || v_origine, 0));
  perform pg_advisory_xact_lock(hashtextextended('mp-lotto:' || p_lotto_id::text, 0));

  select c.in_controllo into v_conto
  from public.magazzino_mp_lotto_conti(p_lotto_id) c;
  if v_conto is null or v_qty > v_conto then
    raise exception 'La quantità supera il conto in controllo.';
  end if;

  select f.stato into v_stato_foglio
  from public.haccp_fogli_ingresso f
  where f.id = v_foglio
    and f.deleted_at is null;
  if v_stato_foglio is distinct from 'chiuso' then
    raise exception 'Il foglio HACCP non è chiuso. La merce resta in controllo.';
  end if;
  select count(distinct r.voce_codice) into v_esiti
  from public.haccp_fogli_ingresso_risposte r
  where r.foglio_id = v_foglio
    and r.voce_codice in ('mezzo', '1e', '2b', '2g', '2h');
  if v_esiti < 5 then
    raise exception 'Mancano esiti dei controlli HACCP. Non vengono considerati conformi.';
  end if;
  if exists (
    select 1
    from (
      select distinct on (r.voce_codice) r.valore
      from public.haccp_fogli_ingresso_risposte r
      where r.foglio_id = v_foglio
        and r.voce_codice in ('mezzo', '1e', '2b', '2g', '2h')
      order by r.voce_codice, r.confermata_at desc
    ) ultimo
    where ultimo.valore->>'esito' is distinct from 'conforme'
  ) then
    raise exception 'Un controllo HACCP è non conforme. La merce resta in controllo.';
  end if;

  perform pg_advisory_xact_lock(hashtextextended('mp-articolo:' || v_materia::text, 0));
  select mp.codice, lower(btrim(coalesce(mp.unita_misura, ''))), mp.categoria_utilizzo
    into v_codice_mp, v_unita_mp, v_categoria
  from public.materie_prime mp
  where mp.id = v_materia
    and mp.deleted_at is null;
  if v_codice_mp is null then
    raise exception 'Materia prima non trovata.';
  end if;
  if v_categoria = 'acquisti_occasionali' then
    raise exception 'Articolo in acquisti occasionali: non si registra un movimento di magazzino.';
  end if;
  if v_unita_mp is distinct from v_unita then
    raise exception 'L''unità del lotto non coincide con l''anagrafica.';
  end if;

  select g.id, g.quantita_kg, g.unita, g.is_test
    into v_giacenza, v_saldo, v_unita_giacenza, v_test
  from public.magazzino_giacenze g
  where g.catalog_kind = 'materia_prima'
    and g.prodotto_id = v_materia
    and g.deleted_at is null
  for update;
  if v_test is true then
    raise exception 'La giacenza di test non si movimenta da questa operazione.';
  end if;
  if v_giacenza is not null and v_unita_giacenza is distinct from v_unita then
    raise exception 'La giacenza è in un''unità diversa. Nessuna conversione è stata applicata.';
  end if;

  insert into public.magazzino_mp_lotto_eventi (
    lotto_id, tipo, quantita, unita, da_stato, a_stato, chiave, motivazione,
    created_by, updated_by
  ) values (
    p_lotto_id, 'accettazione', v_qty, v_unita, 'in_controllo', 'disponibile', v_chiave,
    'Accettazione della quantità conforme', v_uid, v_uid
  )
  returning id into v_evento;

  v_dopo := round(coalesce(v_saldo, 0) + v_qty, 3);
  insert into public.magazzino_movimenti (
    catalog_kind, prodotto_id, prodotto_codice, tipo, quantita_kg, unita,
    barcode_letto, riferimento, note, chiave_idempotenza, is_test,
    lotto_evento_id, registro_classe, created_by, updated_by
  ) values (
    'materia_prima', v_materia, v_codice_mp, 'carico', v_qty, v_unita,
    '', 'lotto-mp', left('Accettazione ' || v_codice, 500), v_chiave, false,
    v_evento, 'lotto', v_uid, v_uid
  )
  returning id into v_mov;

  if v_giacenza is null then
    insert into public.magazzino_giacenze (
      catalog_kind, prodotto_id, prodotto_codice, quantita_kg, unita,
      is_test, created_by, updated_by
    ) values (
      'materia_prima', v_materia, v_codice_mp, v_dopo, v_unita, false, v_uid, v_uid
    );
  else
    update public.magazzino_giacenze
      set quantita_kg = v_dopo, updated_by = v_uid
    where id = v_giacenza;
  end if;

  select c.disponibile into v_disponibile
  from public.magazzino_mp_lotto_conti(p_lotto_id) c;
  insert into public.audit_log (entity_type, entity_id, action, actor_id, summary, payload)
  values (
    'magazzino_mp_lotti', p_lotto_id, 'create', v_uid,
    'Accettazione lotto ' || v_codice || ' · ' || v_qty || ' ' || v_unita,
    jsonb_build_object(
      'evento_id', v_evento, 'movimento_id', v_mov, 'quantita', v_qty, 'saldo', v_dopo
    )
  );
  return jsonb_build_object(
    'evento_id', v_evento,
    'movimento_id', v_mov,
    'lotto_id', p_lotto_id,
    'codice', v_codice,
    'saldo', v_dopo,
    'disponibile', v_disponibile,
    'riusata', false
  );
end;
$$;

create or replace function public.magazzino_mp_preleva_lotto(
  p_lotto_id uuid,
  p_quantita numeric,
  p_chiave text,
  p_foglio_lavorazione_id uuid
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
  v_unita text;
  v_materia uuid;
  v_origine text;
  v_codice text;
  v_deleted timestamptz;
  v_foglio_codice text;
  v_foglio_stato text;
  v_evento uuid;
  v_evento_tipo text;
  v_evento_qty numeric;
  v_evento_lotto uuid;
  v_mov uuid;
  v_mov_tipo text;
  v_mov_qty numeric;
  v_conto numeric;
  v_codice_mp text;
  v_unita_mp text;
  v_categoria text;
  v_giacenza uuid;
  v_saldo numeric(14, 3);
  v_unita_giacenza text;
  v_test boolean;
  v_dopo numeric(14, 3);
  v_disponibile numeric;
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
    raise exception 'Non autorizzato a prelevare il lotto.';
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

  perform pg_advisory_xact_lock(hashtextextended('mp-lotto-chiave:' || v_chiave, 0));
  perform pg_advisory_xact_lock(hashtextextended('mp-chiave:' || v_chiave, 0));

  select e.id, e.tipo, e.quantita, e.lotto_id
    into v_evento, v_evento_tipo, v_evento_qty, v_evento_lotto
  from public.magazzino_mp_lotto_eventi e
  where e.chiave = v_chiave;
  if v_evento is not null then
    select m.id, m.tipo, m.quantita_kg
      into v_mov, v_mov_tipo, v_mov_qty
    from public.magazzino_movimenti m
    where m.lotto_evento_id = v_evento
      and m.deleted_at is null;
    if v_evento_tipo is distinct from 'consumo_uscita'
       or v_evento_qty is distinct from v_qty
       or v_evento_lotto is distinct from p_lotto_id
       or v_mov is null
       or v_mov_tipo is distinct from 'scarico'
       or v_mov_qty is distinct from v_qty then
      raise exception 'La chiave idempotente è già usata con dati diversi.';
    end if;
    return jsonb_build_object(
      'evento_id', v_evento,
      'movimento_id', v_mov,
      'lotto_id', p_lotto_id,
      'riusata', true
    );
  end if;
  if exists (
    select 1 from public.magazzino_movimenti m
    where m.catalog_kind = 'materia_prima'
      and m.chiave_idempotenza = v_chiave
      and m.deleted_at is null
  ) then
    raise exception 'La chiave idempotente è già usata con dati diversi.';
  end if;

  select l.unita, l.materia_prima_id, l.codice, l.deleted_at,
         coalesce(l.carico_riga_id::text, l.foglio_ingresso_mp_id::text)
    into v_unita, v_materia, v_codice, v_deleted, v_origine
  from public.magazzino_mp_lotti l
  where l.id = p_lotto_id;
  if v_unita is null or v_deleted is not null or v_origine is null then
    raise exception 'Lotto non disponibile.';
  end if;

  select fl.codice, fl.stato
    into v_foglio_codice, v_foglio_stato
  from public.produzione_fogli_lavorazione fl
  where fl.id = p_foglio_lavorazione_id
    and fl.deleted_at is null;
  if v_foglio_codice is null or v_foglio_stato is distinct from 'aperto' then
    raise exception 'Il foglio di lavorazione non è aperto.';
  end if;

  perform pg_advisory_xact_lock(hashtextextended('mp-lotto-origine:' || v_origine, 0));
  perform pg_advisory_xact_lock(hashtextextended('mp-lotto:' || p_lotto_id::text, 0));
  select c.disponibile into v_conto
  from public.magazzino_mp_lotto_conti(p_lotto_id) c;
  if v_conto is null or v_qty > v_conto then
    raise exception 'La quantità supera il disponibile del lotto.';
  end if;

  perform pg_advisory_xact_lock(hashtextextended('mp-articolo:' || v_materia::text, 0));
  select mp.codice, lower(btrim(coalesce(mp.unita_misura, ''))), mp.categoria_utilizzo
    into v_codice_mp, v_unita_mp, v_categoria
  from public.materie_prime mp
  where mp.id = v_materia
    and mp.deleted_at is null;
  if v_codice_mp is null then
    raise exception 'Materia prima non trovata.';
  end if;
  if v_categoria = 'acquisti_occasionali' then
    raise exception 'Articolo in acquisti occasionali: non si registra un movimento di magazzino.';
  end if;
  if v_unita_mp is distinct from v_unita then
    raise exception 'L''unità del lotto non coincide con l''anagrafica.';
  end if;

  select g.id, g.quantita_kg, g.unita, g.is_test
    into v_giacenza, v_saldo, v_unita_giacenza, v_test
  from public.magazzino_giacenze g
  where g.catalog_kind = 'materia_prima'
    and g.prodotto_id = v_materia
    and g.deleted_at is null
  for update;
  if v_test is true then
    raise exception 'La giacenza di test non si movimenta da questa operazione.';
  end if;
  if v_giacenza is null or coalesce(v_saldo, 0) < v_qty then
    raise exception 'Giacenza insufficiente per il prelievo.';
  end if;
  if v_unita_giacenza is distinct from v_unita then
    raise exception 'La giacenza è in un''unità diversa. Nessuna conversione è stata applicata.';
  end if;
  v_dopo := round(v_saldo - v_qty, 3);
  if v_dopo < 0 then
    raise exception 'Giacenza insufficiente per il prelievo.';
  end if;

  insert into public.magazzino_mp_lotto_eventi (
    lotto_id, tipo, quantita, unita, da_stato, a_stato, sottotipo, chiave, motivazione,
    created_by, updated_by
  ) values (
    p_lotto_id, 'consumo_uscita', v_qty, v_unita, 'disponibile', 'consumata_uscita',
    'prelievo', v_chiave, left('Prelievo ' || v_foglio_codice, 500), v_uid, v_uid
  )
  returning id into v_evento;

  insert into public.magazzino_movimenti (
    catalog_kind, prodotto_id, prodotto_codice, tipo, quantita_kg, unita,
    barcode_letto, riferimento, note, chiave_idempotenza, is_test,
    lotto_evento_id, registro_classe, created_by, updated_by
  ) values (
    'materia_prima', v_materia, v_codice_mp, 'scarico', v_qty, v_unita,
    '', 'prelievo-mp', left('Prelievo ' || v_codice || ' · ' || v_foglio_codice, 500),
    v_chiave, false, v_evento, 'lotto', v_uid, v_uid
  )
  returning id into v_mov;

  update public.magazzino_giacenze
    set quantita_kg = v_dopo, updated_by = v_uid
  where id = v_giacenza;

  select c.disponibile into v_disponibile
  from public.magazzino_mp_lotto_conti(p_lotto_id) c;
  insert into public.audit_log (entity_type, entity_id, action, actor_id, summary, payload)
  values (
    'magazzino_mp_lotti', p_lotto_id, 'create', v_uid,
    'Prelievo lotto ' || v_codice || ' · ' || v_qty || ' ' || v_unita,
    jsonb_build_object(
      'evento_id', v_evento,
      'movimento_id', v_mov,
      'foglio_lavorazione_id', p_foglio_lavorazione_id,
      'quantita', v_qty,
      'saldo', v_dopo
    )
  );
  return jsonb_build_object(
    'evento_id', v_evento,
    'movimento_id', v_mov,
    'lotto_id', p_lotto_id,
    'codice', v_codice,
    'saldo', v_dopo,
    'disponibile', v_disponibile,
    'riusata', false
  );
end;
$$;

reset role;

revoke create on schema public from magazzino_mp_collegamento;

revoke all on function public.magazzino_mp_accetta_lotto(uuid, numeric, text)
  from public, anon, authenticated, service_role;
revoke all on function public.magazzino_mp_preleva_lotto(uuid, numeric, text, uuid)
  from public, anon, authenticated, service_role;
grant execute on function public.magazzino_mp_accetta_lotto(uuid, numeric, text) to authenticated;
grant execute on function public.magazzino_mp_preleva_lotto(uuid, numeric, text, uuid) to authenticated;

comment on function public.magazzino_mp_accetta_lotto(uuid, numeric, text) is
  'Sposta quantità da in controllo a disponibile e registra il carico nello stesso passaggio. Non legge le deroghe HACCP.';
comment on function public.magazzino_mp_preleva_lotto(uuid, numeric, text, uuid) is
  'Scarica solo quantità già disponibile di un lotto LM-, collegata a un foglio di lavorazione aperto.';

do $$
begin
  if has_schema_privilege('magazzino_mp_collegamento', 'public', 'CREATE') then
    raise exception 'Il ruolo di collegamento non deve creare oggetti.';
  end if;
  if (
    select r.rolname
    from pg_proc p
    join pg_roles r on r.oid = p.proowner
    where p.proname = 'magazzino_mp_accetta_lotto'
  ) is distinct from 'magazzino_mp_collegamento' then
    raise exception 'Proprietario dell''accettazione inatteso.';
  end if;
  if position(
    'lotto_evento_id' in pg_get_functiondef(
      'public.magazzino_mp_registra_movimento(uuid, text, numeric, text, text, text, text)'::regprocedure
    )
  ) > 0 then
    raise exception 'Il registro pubblico non deve collegare i lotti.';
  end if;
end $$;
