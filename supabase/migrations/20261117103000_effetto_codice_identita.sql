-- Il codice prodotto usato è quello archiviato. Una differenza di maiuscole,
-- come PPB4 rispetto a PpB4, non crea un altro prodotto e non riscrive l'anagrafica.

create or replace function public.produzione_registra_effetto_magazzino(
  p_effetto_id uuid,
  p_quantita numeric,
  p_codice text,
  p_lotto text
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_uid uuid;
  v_tipo text;
  v_esito text;
  v_unita text;
  v_foglio uuid;
  v_deleted timestamptz;
  v_foglio_stato text;
  v_lotto_esterno uuid;
  v_prodotto uuid;
  v_unita_prodotto text;
  v_chiave text;
  v_mov uuid;
  v_mov_tipo text;
  v_mov_qty numeric;
  v_mov_lotto text;
  v_giacenza uuid;
  v_saldo numeric(14, 3);
  v_unita_giacenza text;
  v_dopo numeric(14, 3);
  v_codice text;
  v_lotto text;
  v_tipo_mov text;
  v_n integer;
  v_archivio text;
  v_targa text;
begin
  v_uid := public.app_effective_uid();
  if v_uid is null then
    raise exception 'Accesso non autenticato.';
  end if;
  if not (
    public.is_superadmin()
    or public.has_area_access('produzione')
    or public.has_area_access('magazzino')
  ) then
    raise exception 'Non autorizzato a registrare il risultato.';
  end if;
  if p_quantita is null or p_quantita <= 0 or p_quantita > 1000000
     or p_quantita <> round(p_quantita, 3) then
    raise exception 'Quantità non valida.';
  end if;
  v_codice := btrim(coalesce(p_codice, ''));
  v_lotto := btrim(coalesce(p_lotto, ''));
  if v_codice = '' or v_lotto = '' or upper(v_lotto) not like 'L-%' then
    raise exception 'Manca il lotto Agrinsicilia. Nessun carico è stato creato.';
  end if;
  select count(*)::integer, min(p.codice)
    into v_n, v_archivio
  from public.prodotti_propri p
  where lower(p.codice) = lower(v_codice);
  if coalesce(v_n, 0) = 0 then
    raise exception 'Prodotto non trovato.';
  end if;
  if v_n > 1 then
    raise exception 'Il codice prodotto non è univoco.';
  end if;
  v_codice := v_archivio;
  v_targa := split_part(v_lotto, '/', 2);
  if lower(v_targa) = lower(v_codice) and v_targa is distinct from v_codice then
    v_lotto := split_part(v_lotto, '/', 1) || '/' || v_codice || substr(
      v_lotto,
      length(split_part(v_lotto, '/', 1)) + 1 + length(v_targa) + 1
    );
  end if;
  if position('/' || v_codice || '/' in v_lotto) = 0 then
    raise exception 'La targa del lotto non coincide con il prodotto.';
  end if;

  v_chiave := 'effetto-pf-' || p_effetto_id::text;
  perform pg_advisory_xact_lock(hashtextextended('pf-effetto:' || v_chiave, 0));

  select e.tipo, e.esito, lower(btrim(e.unita)), e.foglio_id, e.deleted_at
    into v_tipo, v_esito, v_unita, v_foglio, v_deleted
  from public.produzione_foglio_processo_effetti e
  where e.id = p_effetto_id;
  if v_tipo is null or v_deleted is not null then
    raise exception 'Effetto non disponibile.';
  end if;
  if v_tipo not in ('magazzino.produce', 'magazzino.consuma') then
    raise exception 'Questo effetto non muove il magazzino.';
  end if;
  if v_unita not in ('kg', 'lt', 'pz') then
    raise exception 'Unità diversa. Nessuna conversione è stata applicata.';
  end if;

  select m.id, m.tipo, m.quantita_kg, m.lotto_codice
    into v_mov, v_mov_tipo, v_mov_qty, v_mov_lotto
  from public.magazzino_movimenti m
  where m.chiave_idempotenza = v_chiave
    and m.deleted_at is null;
  v_tipo_mov := case when v_tipo = 'magazzino.produce' then 'carico' else 'scarico' end;
  if v_mov is not null then
    if v_mov_tipo is distinct from v_tipo_mov
       or v_mov_qty is distinct from p_quantita
       or v_mov_lotto is distinct from v_lotto then
      raise exception 'La chiave idempotente è già usata con dati diversi.';
    end if;
    return jsonb_build_object('movimento_id', v_mov, 'riusata', true);
  end if;

  if v_esito is distinct from 'previsto' then
    raise exception 'Questo effetto è già stato registrato.';
  end if;
  select f.stato, f.lotto_esterno_id
    into v_foglio_stato, v_lotto_esterno
  from public.produzione_fogli_lavorazione f
  where f.id = v_foglio
    and f.deleted_at is null;
  if v_foglio_stato is distinct from 'aperto' then
    raise exception 'Il foglio di lavorazione non è aperto.';
  end if;

  select p.id, lower(btrim(p.unita_misura))
    into v_prodotto, v_unita_prodotto
  from public.prodotti_propri p
  where p.codice = v_codice;
  if v_prodotto is null then
    raise exception 'Prodotto non trovato.';
  end if;
  if v_unita_prodotto <> '' and v_unita_prodotto is distinct from v_unita then
    raise exception 'Unità diversa. Nessuna conversione è stata applicata.';
  end if;

  perform pg_advisory_xact_lock(hashtextextended('pf-articolo:' || v_prodotto::text, 0));
  select g.id, g.quantita_kg, g.unita
    into v_giacenza, v_saldo, v_unita_giacenza
  from public.magazzino_giacenze g
  where g.catalog_kind = 'prodotto_proprio'
    and g.prodotto_id = v_prodotto
    and g.deleted_at is null
  for update;
  if v_giacenza is not null and lower(btrim(v_unita_giacenza)) is distinct from v_unita then
    raise exception 'Unità diversa. Nessuna conversione è stata applicata.';
  end if;
  if v_tipo = 'magazzino.consuma' and coalesce(v_saldo, 0) < p_quantita then
    raise exception 'Giacenza insufficiente.';
  end if;
  if v_tipo = 'magazzino.produce' then
    v_dopo := round(coalesce(v_saldo, 0) + p_quantita, 3);
  else
    v_dopo := round(coalesce(v_saldo, 0) - p_quantita, 3);
  end if;
  if v_dopo < 0 then
    raise exception 'Giacenza insufficiente.';
  end if;

  insert into public.magazzino_movimenti (
    catalog_kind, prodotto_id, prodotto_codice, tipo, quantita_kg, unita,
    barcode_letto, riferimento, note, chiave_idempotenza, is_test,
    lotto_codice, foglio_id, lotto_esterno_id, created_by, updated_by
  ) values (
    'prodotto_proprio', v_prodotto, v_codice, v_tipo_mov, p_quantita, v_unita,
    '', 'effetto-magazzino',
    left(v_tipo || ' ' || v_lotto, 500),
    v_chiave, false, v_lotto, v_foglio, v_lotto_esterno, v_uid, v_uid
  )
  returning id into v_mov;

  if v_giacenza is null then
    insert into public.magazzino_giacenze (
      catalog_kind, prodotto_id, prodotto_codice, quantita_kg, unita,
      is_test, created_by, updated_by
    ) values (
      'prodotto_proprio', v_prodotto, v_codice, v_dopo, v_unita, false, v_uid, v_uid
    );
  else
    update public.magazzino_giacenze
      set quantita_kg = v_dopo, updated_by = v_uid
    where id = v_giacenza;
  end if;

  insert into public.audit_log (entity_type, entity_id, action, actor_id, summary, payload)
  values (
    'produzione_foglio_processo_effetti', p_effetto_id, 'create', v_uid,
    v_tipo || ' ' || p_quantita || ' ' || v_unita,
    jsonb_build_object(
      'movimento_id', v_mov, 'lotto', v_lotto, 'prodotto', v_codice, 'saldo', v_dopo
    )
  );

  return jsonb_build_object(
    'movimento_id', v_mov,
    'saldo', v_dopo,
    'riusata', false
  );
end;
$$;

revoke all on function public.produzione_registra_effetto_magazzino(uuid, numeric, text, text)
  from public, anon, authenticated, service_role;
grant execute on function public.produzione_registra_effetto_magazzino(uuid, numeric, text, text)
  to authenticated;

comment on function public.produzione_registra_effetto_magazzino(uuid, numeric, text, text) is
  'Carica o scarica il prodotto finito con il codice archiviato. Non riscrive l''anagrafica e non converte le unità.';
