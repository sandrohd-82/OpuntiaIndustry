-- Bozza DDT di vendita collegata all'ordine e scarico del prodotto finito già fatturato.
-- Non chiama Fatture in Cloud e non assegna un numero Dt-.
-- Lo scarico non ha un foglio di lavorazione: il documento di tracciabilità è il DDT.

alter table public.magazzino_movimenti
  drop constraint if exists magazzino_movimenti_foglio_bypass_check;
alter table public.magazzino_movimenti
  add constraint magazzino_movimenti_foglio_bypass_check
  check (
    motivo_senza_foglio is null
    or motivo_senza_foglio in ('inventario', 'rivisita_ordine', 'ddt_vendita')
  );

alter table public.ddt_documenti
  add column if not exists ordine_id uuid references public.ordini (id) on delete restrict;

create unique index if not exists ddt_documenti_ordine_emesso_uidx
  on public.ddt_documenti (ordine_id)
  where deleted_at is null
    and ordine_id is not null
    and direzione = 'emesso';

create or replace function public.commerciale_prepara_spedizione_ordine(p_ordine_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_uid uuid;
  v_ordine public.ordini%rowtype;
  v_fattura public.fatture_emesse%rowtype;
  v_ddt uuid;
  v_numero text;
  v_piva text := '';
  v_riga record;
  v_n integer;
  v_codice text;
  v_pid text;
  v_unita text;
  v_lotto text;
  v_riga_ordine text;
  v_giacenza uuid;
  v_saldo numeric(14, 3);
  v_unita_giacenza text;
  v_dopo numeric(14, 3);
  v_mov uuid;
  v_scarichi integer := 0;
  v_chiave text;
begin
  v_uid := public.app_effective_uid();
  if v_uid is null then
    raise exception 'Accesso non autenticato.';
  end if;
  if not (
    public.is_superadmin()
    or public.has_area_access('amministrazione')
    or public.has_area_access('magazzino')
  ) then
    raise exception 'Non autorizzato a preparare la spedizione.';
  end if;

  perform pg_advisory_xact_lock(hashtextextended('commerciale-ordine:' || p_ordine_id::text, 0));

  select * into v_ordine
  from public.ordini o
  where o.id = p_ordine_id and o.deleted_at is null;
  if v_ordine.id is null then
    raise exception 'Ordine non trovato.';
  end if;

  select d.id, d.numero_interno into v_ddt, v_numero
  from public.ddt_documenti d
  where d.ordine_id = p_ordine_id
    and d.direzione = 'emesso'
    and d.deleted_at is null
  limit 1;
  if v_ddt is not null then
    return jsonb_build_object(
      'ddt_id', v_ddt,
      'numero', v_numero,
      'riusata', true,
      'inviato', false
    );
  end if;

  select * into v_fattura
  from public.fatture_emesse f
  where f.ordine_id = p_ordine_id
    and f.tipo_documento = 'fattura'
    and f.deleted_at is null
  order by f.created_at desc
  limit 1;
  if v_fattura.id is null then
    raise exception 'Manca la fattura. Il DDT non è stato creato e il magazzino non è stato mosso.';
  end if;
  if v_fattura.stato_pagamento = 'annullata' then
    raise exception 'La fattura è annullata. Il DDT non è stato creato e il magazzino non è stato mosso.';
  end if;

  if not exists (
    select 1 from public.fatture_emesse_righe r
    where r.fattura_id = v_fattura.id and r.deleted_at is null and r.quantita > 0
  ) then
    raise exception 'La fattura non ha righe. Il DDT non è stato creato e il magazzino non è stato mosso.';
  end if;

  for v_riga in
    select r.*
    from public.fatture_emesse_righe r
    where r.fattura_id = v_fattura.id
      and r.deleted_at is null
      and coalesce(r.is_spedizione, false) = false
      and r.quantita > 0
  loop
    select count(*)::integer, min(p.codice), min(p.id::text), min(lower(btrim(p.unita_misura)))
      into v_n, v_codice, v_pid, v_unita
    from public.prodotti_propri p
    where lower(p.codice) = lower(btrim(v_riga.codice));
    if coalesce(v_n, 0) = 0 then
      continue;
    end if;
    if v_n > 1 then
      raise exception 'Il codice prodotto non è univoco. Il DDT non è stato creato e il magazzino non è stato mosso.';
    end if;
    if v_unita <> '' and v_unita is distinct from lower(btrim(v_riga.unita_misura)) then
      raise exception 'Unità diversa. Nessuna conversione è stata applicata. Il DDT non è stato creato e il magazzino non è stato mosso.';
    end if;
    select count(*)::integer, min(l.id::text), min(btrim(l.lotto_codice))
      into v_n, v_riga_ordine, v_lotto
    from public.ordini_righe l
    where l.ordine_id = p_ordine_id
      and lower(l.prodotto_codice) = lower(v_codice);
    if coalesce(v_n, 0) = 0 or coalesce(v_lotto, '') = '' then
      raise exception 'Manca il lotto sulla riga %. Nessun DDT e nessuno scarico sono stati creati.', v_codice;
    end if;
    if v_n > 1 then
      raise exception 'La riga ordine % non è univoca. Nessun DDT e nessuno scarico sono stati creati.', v_codice;
    end if;
    perform pg_advisory_xact_lock(hashtextextended('pf-articolo:' || v_pid, 0));
    select g.id, g.quantita_kg, g.unita
      into v_giacenza, v_saldo, v_unita_giacenza
    from public.magazzino_giacenze g
    where g.catalog_kind = 'prodotto_proprio'
      and g.prodotto_id = v_pid::uuid
      and g.deleted_at is null
    for update;
    if v_giacenza is not null and lower(btrim(v_unita_giacenza)) is distinct from v_unita then
      raise exception 'Unità diversa. Nessuna conversione è stata applicata. Il DDT non è stato creato e il magazzino non è stato mosso.';
    end if;
    if coalesce(v_saldo, 0) < v_riga.quantita then
      raise exception 'Giacenza insufficiente. Nessun DDT e nessuno scarico sono stati creati.';
    end if;
  end loop;

  if v_ordine.cliente_id is not null then
    select coalesce(c.partita_iva, '') into v_piva
    from public.clienti c
    where c.id = v_ordine.cliente_id;
  end if;

  v_numero := left('Bozza-' || v_ordine.numero_interno, 80);
  insert into public.ddt_documenti (
    direzione, numero_interno, cliente_id, ragione_sociale, partita_iva,
    data_documento, causale_trasporto, destinazione, imponibile, imposta, totale,
    stato, note, ordine_id, created_by, updated_by
  ) values (
    'emesso', v_numero, v_ordine.cliente_id, v_fattura.cliente_ragione_sociale, coalesce(v_piva, ''),
    current_date, 'Vendita', coalesce(v_ordine.indirizzo_spedizione, ''),
    v_fattura.imponibile, v_fattura.imposta, v_fattura.totale,
    'bozza',
    'Bozza locale collegata all''ordine. Non inviata a Fatture in Cloud né al cliente.',
    p_ordine_id, v_uid, v_uid
  )
  returning id into v_ddt;

  insert into public.ddt_righe (
    ddt_id, sort_order, codice, descrizione, quantita, prezzo_unitario,
    sconto_percentuale, iva_percentuale, importo, created_by, updated_by
  )
  select
    v_ddt, r.sort_order, r.codice, r.descrizione, r.quantita, r.prezzo_unitario,
    r.sconto_percentuale, r.iva_percentuale, r.importo, v_uid, v_uid
  from public.fatture_emesse_righe r
  where r.fattura_id = v_fattura.id and r.deleted_at is null;

  for v_riga in
    select r.*
    from public.fatture_emesse_righe r
    where r.fattura_id = v_fattura.id
      and r.deleted_at is null
      and coalesce(r.is_spedizione, false) = false
      and r.quantita > 0
  loop
    select count(*)::integer, min(p.codice), min(p.id::text), min(lower(btrim(p.unita_misura)))
      into v_n, v_codice, v_pid, v_unita
    from public.prodotti_propri p
    where lower(p.codice) = lower(btrim(v_riga.codice));
    if coalesce(v_n, 0) = 0 then
      continue;
    end if;
    select l.id::text, btrim(l.lotto_codice)
      into v_riga_ordine, v_lotto
    from public.ordini_righe l
    where l.ordine_id = p_ordine_id
      and lower(l.prodotto_codice) = lower(v_codice);
    v_chiave := 'ordine-riga-pf-' || v_riga_ordine::text;
    select m.id into v_mov
    from public.magazzino_movimenti m
    where m.chiave_idempotenza = v_chiave and m.deleted_at is null;
    if v_mov is not null then
      continue;
    end if;
    perform pg_advisory_xact_lock(hashtextextended('pf-articolo:' || v_pid, 0));
    select g.id, g.quantita_kg
      into v_giacenza, v_saldo
    from public.magazzino_giacenze g
    where g.catalog_kind = 'prodotto_proprio'
      and g.prodotto_id = v_pid::uuid
      and g.deleted_at is null
    for update;
    v_dopo := round(coalesce(v_saldo, 0) - v_riga.quantita, 3);
    if v_dopo < 0 then
      raise exception 'Giacenza insufficiente. Nessun DDT e nessuno scarico sono stati creati.';
    end if;
    insert into public.magazzino_movimenti (
      catalog_kind, prodotto_id, prodotto_codice, tipo, quantita_kg, unita,
      barcode_letto, riferimento, note, chiave_idempotenza, is_test,
      lotto_codice, motivo_senza_foglio, created_by, updated_by
    ) values (
      'prodotto_proprio', v_pid::uuid, v_codice, 'scarico', v_riga.quantita, v_unita,
      '', 'ddt-vendita', left(v_numero || ' ' || v_lotto, 500),
      v_chiave, false, v_lotto, 'ddt_vendita', v_uid, v_uid
    );
    update public.magazzino_giacenze
      set quantita_kg = v_dopo, updated_by = v_uid
    where id = v_giacenza;
    v_scarichi := v_scarichi + 1;
  end loop;

  insert into public.audit_log (entity_type, entity_id, action, actor_id, summary, payload)
  values (
    'ddt_documenti', v_ddt, 'create', v_uid,
    'Bozza DDT ' || v_numero || ' dall''ordine ' || v_ordine.numero_interno,
    jsonb_build_object(
      'ordine_id', p_ordine_id,
      'fattura_id', v_fattura.id,
      'scarichi', v_scarichi,
      'inviato', false
    )
  );

  return jsonb_build_object(
    'ddt_id', v_ddt,
    'numero', v_numero,
    'riusata', false,
    'scarichi', v_scarichi,
    'inviato', false
  );
end;
$$;

revoke all on function public.commerciale_prepara_spedizione_ordine(uuid)
  from public, anon, authenticated, service_role;
grant execute on function public.commerciale_prepara_spedizione_ordine(uuid)
  to authenticated;

comment on function public.commerciale_prepara_spedizione_ordine(uuid) is
  'Crea una bozza DDT locale copiando la fattura e scarica il prodotto finito una sola volta. Non invia nulla a Fatture in Cloud.';
