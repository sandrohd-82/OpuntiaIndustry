-- Giorni fissi della settimana: estende solo i valori di tipologia gia usati dai piani.
-- Gli ordini gia salvati restano con la tipologia precedente.

do $$
declare
  r record;
begin
  for r in
    select con.conname, rel.relname
    from pg_constraint con
    join pg_class rel on rel.oid = con.conrelid
    join pg_namespace nsp on nsp.oid = rel.relnamespace
    where nsp.nspname = 'public'
      and rel.relname in ('approvvigionamenti_piani', 'approvvigionamenti_piani_versioni')
      and con.contype = 'c'
      and pg_get_constraintdef(con.oid) ilike '%tipologia%'
  loop
    execute format('alter table public.%I drop constraint %I', r.relname, r.conname);
  end loop;
end $$;

alter table public.approvvigionamenti_piani
  add constraint approvvigionamenti_piani_tipologia_check
  check (tipologia in ('settimanale', 'mensile', 'regolare', 'personalizzata', 'giorni_fissi'));

alter table public.approvvigionamenti_piani_versioni
  add constraint approvvigionamenti_piani_versioni_tipologia_check
  check (tipologia in ('settimanale', 'mensile', 'regolare', 'personalizzata', 'giorni_fissi'));

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
  v_ids uuid[] := array[]::uuid[];
  v_piani jsonb;
  v_elenco jsonb;
  v_meta jsonb;
  v_tipologia text;
  v_cadenza integer;
  v_tipo_quantita text;
  v_inizio date;
  v_fine date;
  v_piano uuid;
  v_codice text;
  v_tipo_riga text;
begin
  if not public.approvvigionamento_autorizzato() then
    raise exception 'Non autorizzato a registrare gli approvvigionamenti';
  end if;
  if p_tipo not in ('crea', 'copia', 'settimana', 'piano', 'pianificazione') then
    raise exception 'Tipo operazione non valido';
  end if;
  if jsonb_typeof(p_ordini) <> 'array' or jsonb_array_length(p_ordini) = 0 then
    raise exception 'Nessun ordine da registrare';
  end if;
  if jsonb_array_length(p_ordini) > 200 then
    raise exception 'La pianificazione supera 200 consegne.';
  end if;

  v_meta := coalesce(p_ordini->0->'pianificazione', '{}'::jsonb);
  v_tipologia := v_meta->>'tipologia';
  v_cadenza := nullif(v_meta->>'cadenzaGiorni', '')::integer;
  v_tipo_quantita := coalesce(nullif(v_meta->>'tipoQuantita', ''), 'precisa');
  v_inizio := nullif(v_meta->>'periodoInizio', '')::date;
  v_fine := nullif(v_meta->>'periodoFine', '')::date;
  if p_tipo = 'pianificazione' then
    if v_tipologia not in ('regolare', 'personalizzata', 'giorni_fissi') then
      raise exception 'Tipo di pianificazione non valido';
    end if;
    if v_tipo_quantita not in ('precisa', 'stimata') then
      raise exception 'Tipo quantità non valido';
    end if;
    if v_inizio is null or v_fine is null or v_fine < v_inizio then
      raise exception 'Periodo di pianificazione non valido';
    end if;
    if v_tipologia = 'regolare' and (v_cadenza is null or v_cadenza < 1) then
      raise exception 'Indica ogni quanti giorni ripetere la consegna.';
    end if;
    if v_tipologia in ('personalizzata', 'giorni_fissi') then
      v_cadenza := null;
    end if;
  end if;

  for v_ordine in select value from jsonb_array_elements(p_ordini)
  loop
    if p_tipo = 'pianificazione'
       and (
         (v_ordine->>'dataConsegna')::date < v_inizio
         or (v_ordine->>'dataConsegna')::date > v_fine
       )
    then
      raise exception 'Una consegna esce dal periodo della pianificazione.';
    end if;
    for v_riga in select value from jsonb_array_elements(v_ordine->'righe')
    loop
      v_tipo_riga := coalesce(nullif(v_riga->>'tipoQuantita', ''), 'precisa');
      if v_tipo_riga not in ('precisa', 'stimata') then
        raise exception 'Tipo quantità non valido';
      end if;
    end loop;
    perform public.approvvigionamento_valida_righe(
      (v_ordine->>'fornitoreId')::uuid,
      v_ordine->'righe'
    );
  end loop;

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
      ordine_id, materia_prima_id, quantita, unita_misura, tipo_quantita, note, sort_order,
      created_by, updated_by
    )
    select
      v_ordine_id,
      (riga->>'materiaPrimaId')::uuid,
      (riga->>'quantita')::numeric,
      riga->>'unitaMisura',
      coalesce(nullif(riga->>'tipoQuantita', ''), 'precisa'),
      left(coalesce(riga->>'note', ''), 500),
      ordinality::integer - 1,
      public.app_effective_uid(),
      public.app_effective_uid()
    from jsonb_array_elements(v_ordine->'righe') with ordinality as t(riga, ordinality);

    insert into public.approvvigionamenti_operazioni_ordini (operazione_id, ordine_id)
    values (v_operazione, v_ordine_id);
    v_ids := array_append(v_ids, v_ordine_id);
  end loop;

  if p_tipo = 'pianificazione' then
    v_piani := '[]'::jsonb;
    for v_fornitore in
      select distinct o.fornitore_id
      from public.approvvigionamenti_ordini o
      where o.id = any(v_ids)
    loop
      v_codice := 'PP-' || to_char(current_date, 'YY') || '-'
        || lpad(nextval('public.approvvigionamenti_piani_codice_seq')::text, 4, '0');
      insert into public.approvvigionamenti_piani (
        codice, fornitore_id, periodo_inizio, periodo_fine, tipologia, cadenza_giorni,
        tipo_quantita, stato, created_by, updated_by
      )
      values (
        v_codice, v_fornitore, v_inizio, v_fine, v_tipologia, v_cadenza,
        v_tipo_quantita, 'bozza',
        public.app_effective_uid(), public.app_effective_uid()
      )
      returning id into v_piano;
      insert into public.approvvigionamenti_piani_ordini (piano_id, ordine_id, created_by)
      select v_piano, o.id, public.app_effective_uid()
      from public.approvvigionamenti_ordini o
      where o.id = any(v_ids)
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
  else
    v_piani := public.approvvigionamento_crea_piani(p_tipo, v_ids);
  end if;

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
