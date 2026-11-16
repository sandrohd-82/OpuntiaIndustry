-- Decisioni qualitative sui lotti, senza giacenza e senza il conto disponibile.
-- L'uscita del materiale già respinto è un evento distinto: toglie dalla
-- respinta presente e aggiunge alla respinta uscita.

alter table public.magazzino_mp_lotto_eventi
  drop constraint if exists magazzino_mp_lotto_eventi_tipo_check;
alter table public.magazzino_mp_lotto_eventi
  add constraint magazzino_mp_lotto_eventi_tipo_check check (tipo in (
    'identificazione', 'accettazione', 'blocco', 'sblocco',
    'respingimento', 'uscita_respinta', 'consumo_uscita',
    'rettifica_identita', 'rettifica_evento'
  ));

create or replace function public.magazzino_mp_evento_delta(
  p_tipo text,
  p_quantita numeric,
  p_da text,
  p_a text,
  p_segno smallint,
  p_riferimento uuid
)
returns table (
  identificata numeric,
  rettifica numeric,
  in_controllo numeric,
  disponibile numeric,
  bloccata numeric,
  respinta_presente numeric,
  respinta_uscita numeric,
  consumata_uscita numeric
)
language plpgsql
stable
security invoker
set search_path = public
as $$
declare
  v_tipo text;
  v_quantita numeric;
  v_da text;
  v_a text;
  v_segno smallint;
begin
  if p_tipo = 'rettifica_evento' then
    select e.tipo, e.quantita, e.da_stato, e.a_stato, e.segno
      into v_tipo, v_quantita, v_da, v_a, v_segno
    from public.magazzino_mp_lotto_eventi e
    where e.id = p_riferimento;
    if v_tipo is null or v_tipo = 'rettifica_evento' then
      raise exception 'Rettifica senza evento compensabile.';
    end if;
    return query
    select
      -d.identificata, -d.rettifica, -d.in_controllo, -d.disponibile,
      -d.bloccata, -d.respinta_presente, -d.respinta_uscita, -d.consumata_uscita
    from public.magazzino_mp_evento_delta(
      v_tipo, v_quantita, v_da, v_a, v_segno, null
    ) d;
    return;
  end if;

  return query
  select
    case when p_tipo = 'identificazione' then p_quantita else 0 end,
    case when p_tipo = 'rettifica_identita' then p_segno * p_quantita else 0 end,
    case
      when p_tipo = 'identificazione' then p_quantita
      when p_tipo = 'accettazione' then -p_quantita
      when p_tipo = 'blocco' and p_da = 'in_controllo' then -p_quantita
      when p_tipo = 'sblocco' then p_quantita
      when p_tipo = 'respingimento' and p_da = 'in_controllo' then -p_quantita
      when p_tipo = 'rettifica_identita' then p_segno * p_quantita
      else 0
    end,
    case
      when p_tipo = 'accettazione' then p_quantita
      when p_tipo = 'blocco' and p_da = 'disponibile' then -p_quantita
      when p_tipo = 'respingimento' and p_da = 'disponibile' then -p_quantita
      when p_tipo = 'consumo_uscita' then -p_quantita
      else 0
    end,
    case
      when p_tipo = 'blocco' and p_da = 'in_controllo' then p_quantita
      when p_tipo = 'blocco' and p_da = 'disponibile' then p_quantita
      when p_tipo = 'sblocco' then -p_quantita
      when p_tipo = 'respingimento' and p_da = 'bloccata' then -p_quantita
      else 0
    end,
    case
      when p_tipo = 'respingimento' and p_a = 'respinta_presente' then p_quantita
      when p_tipo = 'uscita_respinta'
           and p_da = 'respinta_presente'
           and p_a = 'respinta_uscita' then -p_quantita
      else 0
    end,
    case
      when p_tipo = 'respingimento' and p_a = 'respinta_uscita' then p_quantita
      when p_tipo = 'uscita_respinta'
           and p_da = 'respinta_presente'
           and p_a = 'respinta_uscita' then p_quantita
      else 0
    end,
    case when p_tipo = 'consumo_uscita' then p_quantita else 0 end;
end;
$$;

create or replace function public.magazzino_mp_lotto_eventi_proteggi()
returns trigger
language plpgsql
security invoker
set search_path = public
as $$
declare
  v_lotto public.magazzino_mp_lotti%rowtype;
  v_rif public.magazzino_mp_lotto_eventi%rowtype;
  v_id numeric;
  v_re numeric;
  v_ic numeric;
  v_di numeric;
  v_bl numeric;
  v_rp numeric;
  v_ru numeric;
  v_co numeric;
  v_tetto numeric;
  v_occupata numeric;
begin
  if tg_op <> 'INSERT' then
    raise exception 'Un evento di lotto non si modifica e non si cancella.';
  end if;
  if new.movimento_id is not null then
    raise exception 'Il collegamento dell''evento al registro non è attivo.';
  end if;

  select * into v_lotto
  from public.magazzino_mp_lotti
  where id = new.lotto_id
    and deleted_at is null;
  if v_lotto.id is null then
    raise exception 'Lotto non disponibile.';
  end if;
  if new.unita is distinct from v_lotto.unita then
    raise exception 'L''unità dell''evento deve coincidere con il lotto.';
  end if;

  perform pg_advisory_xact_lock(hashtextextended(
    'mp-lotto-origine:' || coalesce(v_lotto.carico_riga_id::text, v_lotto.foglio_ingresso_mp_id::text),
    0
  ));
  perform pg_advisory_xact_lock(hashtextextended('mp-lotto:' || v_lotto.id::text, 0));

  if new.tipo = 'identificazione' then
    if new.da_stato is not null or new.a_stato is distinct from 'in_controllo'
       or new.segno is not null or new.sottotipo is not null
       or new.evento_riferimento_id is not null then
      raise exception 'Identificazione non valida.';
    end if;
  elsif new.tipo = 'accettazione' then
    if new.da_stato is distinct from 'in_controllo'
       or new.a_stato is distinct from 'disponibile'
       or new.segno is not null or new.sottotipo is not null
       or new.evento_riferimento_id is not null then
      raise exception 'Accettazione non valida.';
    end if;
  elsif new.tipo = 'blocco' then
    if not (
      (new.da_stato = 'in_controllo' and new.a_stato = 'bloccata')
      or (new.da_stato = 'disponibile' and new.a_stato = 'bloccata')
    ) or new.segno is not null or new.sottotipo is not null
      or new.evento_riferimento_id is not null
      or char_length(btrim(coalesce(new.motivazione, ''))) < 3 then
      raise exception 'Blocco non valido.';
    end if;
  elsif new.tipo = 'sblocco' then
    if new.da_stato is distinct from 'bloccata'
       or new.a_stato is distinct from 'in_controllo'
       or new.segno is not null or new.sottotipo is not null
       or new.evento_riferimento_id is not null
       or char_length(btrim(coalesce(new.motivazione, ''))) < 3 then
      raise exception 'Sblocco non valido.';
    end if;
  elsif new.tipo = 'respingimento' then
    if new.da_stato not in ('in_controllo', 'bloccata', 'disponibile')
       or new.a_stato not in ('respinta_presente', 'respinta_uscita')
       or char_length(btrim(coalesce(new.motivazione, ''))) < 3
       or new.segno is not null or new.sottotipo is not null
       or new.evento_riferimento_id is not null then
      raise exception 'Respingimento non valido.';
    end if;
  elsif new.tipo = 'uscita_respinta' then
    if new.da_stato is distinct from 'respinta_presente'
       or new.a_stato is distinct from 'respinta_uscita'
       or char_length(btrim(coalesce(new.motivazione, ''))) < 3
       or new.segno is not null or new.sottotipo is not null
       or new.evento_riferimento_id is not null then
      raise exception 'Uscita del respinto non valida.';
    end if;
  elsif new.tipo = 'consumo_uscita' then
    if new.da_stato is distinct from 'disponibile'
       or new.a_stato is distinct from 'consumata_uscita'
       or new.sottotipo not in ('prelievo', 'consumo')
       or new.segno is not null or new.evento_riferimento_id is not null then
      raise exception 'Consumo o uscita non validi.';
    end if;
  elsif new.tipo = 'rettifica_identita' then
    if new.segno is null or new.da_stato is distinct from 'in_controllo'
       or new.a_stato is distinct from 'in_controllo'
       or char_length(btrim(new.motivazione)) < 3
       or new.sottotipo is not null or new.evento_riferimento_id is not null then
      raise exception 'Rettifica di conteggio non valida.';
    end if;
  elsif new.tipo = 'rettifica_evento' then
    select * into v_rif
    from public.magazzino_mp_lotto_eventi
    where id = new.evento_riferimento_id
      and lotto_id = new.lotto_id;
    if v_rif.id is null or v_rif.tipo = 'rettifica_evento' then
      raise exception 'Rettifica senza evento compensabile.';
    end if;
    if exists (
      select 1 from public.magazzino_mp_lotto_eventi e
      where e.evento_riferimento_id = v_rif.id
        and e.tipo = 'rettifica_evento'
    ) then
      raise exception 'Evento già compensato.';
    end if;
    if new.quantita is distinct from v_rif.quantita
       or new.unita is distinct from v_rif.unita
       or char_length(btrim(new.motivazione)) < 3 then
      raise exception 'Rettifica non allineata all''evento.';
    end if;
  else
    raise exception 'Tipo evento non previsto.';
  end if;

  select c.identificata, c.rettifica, c.in_controllo, c.disponibile,
         c.bloccata, c.respinta_presente, c.respinta_uscita, c.consumata_uscita
    into v_id, v_re, v_ic, v_di, v_bl, v_rp, v_ru, v_co
  from public.magazzino_mp_lotto_conti(new.lotto_id) c;

  select
    v_id + d.identificata, v_re + d.rettifica, v_ic + d.in_controllo,
    v_di + d.disponibile, v_bl + d.bloccata, v_rp + d.respinta_presente,
    v_ru + d.respinta_uscita, v_co + d.consumata_uscita
  into v_id, v_re, v_ic, v_di, v_bl, v_rp, v_ru, v_co
  from public.magazzino_mp_evento_delta(
    new.tipo, new.quantita, new.da_stato, new.a_stato, new.segno, new.evento_riferimento_id
  ) d;

  if v_id < 0 or v_re + v_id < 0 or v_ic < 0 or v_di < 0 or v_bl < 0
     or v_rp < 0 or v_ru < 0 or v_co < 0
     or v_id + v_re <> v_ic + v_di + v_bl + v_rp + v_ru + v_co then
    raise exception 'La rettifica renderebbe negativo un conto del lotto.';
  end if;

  if v_lotto.carico_riga_id is not null then
    select r.quantita_arrivata into v_tetto
    from public.approvvigionamenti_carichi_righe r
    where r.id = v_lotto.carico_riga_id;
  else
    select f.quantita into v_tetto
    from public.produzione_fogli_ingresso_mp f
    where f.id = v_lotto.foglio_ingresso_mp_id;
  end if;
  if v_tetto is null then
    raise exception 'Quantità di ingresso non disponibile.';
  end if;

  select coalesce(sum(c.identificata + c.rettifica), 0)
    into v_occupata
  from public.magazzino_mp_lotti l
  cross join lateral public.magazzino_mp_lotto_conti(l.id) c
  where l.deleted_at is null
    and l.id is distinct from new.lotto_id
    and (
      (v_lotto.carico_riga_id is not null and l.carico_riga_id = v_lotto.carico_riga_id)
      or (v_lotto.foglio_ingresso_mp_id is not null and l.foglio_ingresso_mp_id = v_lotto.foglio_ingresso_mp_id)
    );
  v_occupata := v_occupata + v_id + v_re;
  if v_occupata < 0 or v_occupata > v_tetto then
    raise exception 'La quantità identificata supera l''ingresso o diventa negativa.';
  end if;

  return new;
end;
$$;

revoke all on function public.magazzino_mp_lotto_eventi_proteggi() from public, anon, authenticated;
revoke all on function public.magazzino_mp_evento_delta(text, numeric, text, text, smallint, uuid)
  from public, anon;
grant execute on function public.magazzino_mp_evento_delta(text, numeric, text, text, smallint, uuid)
  to authenticated, magazzino_mp_identificazione;

do $$
begin
  if current_user in ('anon', 'authenticated', 'service_role', 'authenticator') then
    raise exception 'La proprietà delle decisioni non si assegna da un ruolo client.';
  end if;
  if not exists (select 1 from pg_roles where rolname = 'magazzino_mp_decisione') then
    create role magazzino_mp_decisione nologin noinherit;
  end if;
end $$;

revoke magazzino_mp_decisione from anon, authenticated, service_role, authenticator;
grant magazzino_mp_decisione to current_user;
grant usage on schema public to magazzino_mp_decisione;

grant select, insert on public.magazzino_mp_lotto_eventi to magazzino_mp_decisione;
grant select on public.magazzino_mp_lotti to magazzino_mp_decisione;
grant select on public.approvvigionamenti_carichi_righe to magazzino_mp_decisione;
grant select on public.produzione_fogli_ingresso_mp to magazzino_mp_decisione;
grant insert on public.audit_log to magazzino_mp_decisione;
grant execute on function public.app_effective_uid() to magazzino_mp_decisione;
grant execute on function public.is_superadmin() to magazzino_mp_decisione;
grant execute on function public.has_area_access(text) to magazzino_mp_decisione;
grant execute on function public.magazzino_mp_lotto_conti(uuid) to magazzino_mp_decisione;
grant execute on function public.magazzino_mp_evento_delta(text, numeric, text, text, smallint, uuid)
  to magazzino_mp_decisione;

drop policy if exists "magazzino_mp_lotti_decisione_sel" on public.magazzino_mp_lotti;
create policy "magazzino_mp_lotti_decisione_sel"
  on public.magazzino_mp_lotti for select
  to magazzino_mp_decisione
  using (true);

drop policy if exists "magazzino_mp_lotto_eventi_decisione_sel" on public.magazzino_mp_lotto_eventi;
create policy "magazzino_mp_lotto_eventi_decisione_sel"
  on public.magazzino_mp_lotto_eventi for select
  to magazzino_mp_decisione
  using (true);

drop policy if exists "magazzino_mp_lotto_eventi_decisione_ins" on public.magazzino_mp_lotto_eventi;
create policy "magazzino_mp_lotto_eventi_decisione_ins"
  on public.magazzino_mp_lotto_eventi for insert
  to magazzino_mp_decisione
  with check (
    movimento_id is null
    and evento_riferimento_id is null
    and segno is null
    and sottotipo is null
    and da_stato is distinct from 'disponibile'
    and a_stato is distinct from 'disponibile'
    and char_length(btrim(motivazione)) >= 3
    and (
      (tipo = 'blocco' and da_stato = 'in_controllo' and a_stato = 'bloccata')
      or (tipo = 'sblocco' and da_stato = 'bloccata' and a_stato = 'in_controllo')
      or (
        tipo = 'respingimento'
        and da_stato in ('in_controllo', 'bloccata')
        and a_stato = 'respinta_presente'
      )
      or (
        tipo = 'uscita_respinta'
        and da_stato = 'respinta_presente'
        and a_stato = 'respinta_uscita'
      )
    )
  );

drop policy if exists "approvvigionamenti_carichi_righe_mp_decisione_sel"
  on public.approvvigionamenti_carichi_righe;
create policy "approvvigionamenti_carichi_righe_mp_decisione_sel"
  on public.approvvigionamenti_carichi_righe for select
  to magazzino_mp_decisione
  using (true);

drop policy if exists "produzione_fogli_ingresso_mp_decisione_sel"
  on public.produzione_fogli_ingresso_mp;
create policy "produzione_fogli_ingresso_mp_decisione_sel"
  on public.produzione_fogli_ingresso_mp for select
  to magazzino_mp_decisione
  using (deleted_at is null);

drop policy if exists "audit_log_insert_mp_decisione" on public.audit_log;
create policy "audit_log_insert_mp_decisione"
  on public.audit_log for insert
  to magazzino_mp_decisione
  with check (entity_type = 'magazzino_mp_lotti' and action = 'create');

grant usage, create on schema public to magazzino_mp_decisione;

set local role magazzino_mp_decisione;

create or replace function public.magazzino_mp_decidi_lotto(
  p_lotto_id uuid,
  p_tipo text,
  p_da text,
  p_a text,
  p_quantita numeric,
  p_chiave text,
  p_motivazione text
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_uid uuid;
  v_chiave text;
  v_motivazione text;
  v_qty numeric(14, 3);
  v_unita text;
  v_origine text;
  v_deleted timestamptz;
  v_evento uuid;
  v_tipo text;
  v_da text;
  v_a text;
  v_evento_qty numeric;
  v_evento_motivazione text;
  v_evento_lotto uuid;
  v_conto numeric;
  v_delta_disponibile numeric;
begin
  v_uid := public.app_effective_uid();
  if v_uid is null then
    raise exception 'Accesso non autenticato.';
  end if;
  if p_da = 'disponibile' or p_a = 'disponibile' or not (
    (p_tipo = 'blocco' and p_da = 'in_controllo' and p_a = 'bloccata')
    or (p_tipo = 'sblocco' and p_da = 'bloccata' and p_a = 'in_controllo')
    or (
      p_tipo = 'respingimento'
      and p_da in ('in_controllo', 'bloccata')
      and p_a = 'respinta_presente'
    )
    or (
      p_tipo = 'uscita_respinta'
      and p_da = 'respinta_presente'
      and p_a = 'respinta_uscita'
    )
  ) then
    raise exception 'Transizione non consentita.';
  end if;

  if p_tipo = 'sblocco' or (p_tipo = 'respingimento' and p_da = 'bloccata') then
    if not (public.is_superadmin() or public.has_area_access('produzione')) then
      raise exception 'Non autorizzato: serve Produzione o superadmin.';
    end if;
  elsif p_tipo in ('blocco', 'respingimento', 'uscita_respinta') then
    if not (
      public.is_superadmin()
      or public.has_area_access('magazzino')
      or public.has_area_access('produzione')
    ) then
      raise exception 'Non autorizzato a decidere il lotto.';
    end if;
  else
    raise exception 'Transizione non consentita.';
  end if;

  v_chiave := btrim(coalesce(p_chiave, ''));
  v_motivazione := btrim(coalesce(p_motivazione, ''));
  if char_length(v_chiave) < 8 or char_length(v_chiave) > 200 then
    raise exception 'Chiave idempotente non valida.';
  end if;
  if char_length(v_motivazione) < 3 then
    raise exception 'Motivazione obbligatoria.';
  end if;
  if p_quantita is null or p_quantita <= 0 or p_quantita > 1000000
     or p_quantita <> round(p_quantita, 3) then
    raise exception 'Quantità non valida.';
  end if;
  v_qty := p_quantita;

  -- Prima la chiave, poi l'origine del lotto, poi il lotto.
  -- Il trigger dell'evento ripete origine e lotto, nello stesso ordine.
  perform pg_advisory_xact_lock(hashtextextended('mp-lotto-chiave:' || v_chiave, 0));

  select e.id, e.tipo, e.da_stato, e.a_stato, e.quantita, e.motivazione, e.lotto_id
    into v_evento, v_tipo, v_da, v_a, v_evento_qty, v_evento_motivazione, v_evento_lotto
  from public.magazzino_mp_lotto_eventi e
  where e.chiave = v_chiave;

  if v_evento is not null then
    if v_tipo is distinct from p_tipo
       or v_da is distinct from p_da
       or v_a is distinct from p_a
       or v_evento_qty is distinct from v_qty
       or v_evento_lotto is distinct from p_lotto_id
       or btrim(v_evento_motivazione) is distinct from v_motivazione then
      raise exception 'La chiave idempotente è già usata con dati diversi.';
    end if;
    return jsonb_build_object(
      'evento_id', v_evento,
      'lotto_id', p_lotto_id,
      'riusata', true,
      'tipo', p_tipo,
      'da', p_da,
      'a', p_a
    );
  end if;

  select l.unita, l.deleted_at,
         coalesce(l.carico_riga_id::text, l.foglio_ingresso_mp_id::text)
    into v_unita, v_deleted, v_origine
  from public.magazzino_mp_lotti l
  where l.id = p_lotto_id;
  if v_unita is null or v_deleted is not null or v_origine is null then
    raise exception 'Lotto non disponibile.';
  end if;

  perform pg_advisory_xact_lock(hashtextextended('mp-lotto-origine:' || v_origine, 0));
  perform pg_advisory_xact_lock(hashtextextended('mp-lotto:' || p_lotto_id::text, 0));

  select case p_da
           when 'in_controllo' then c.in_controllo
           when 'bloccata' then c.bloccata
           when 'respinta_presente' then c.respinta_presente
           else -1
         end
    into v_conto
  from public.magazzino_mp_lotto_conti(p_lotto_id) c;
  if v_conto is null or v_qty > v_conto then
    raise exception 'La quantità supera il conto di origine.';
  end if;

  select d.disponibile into v_delta_disponibile
  from public.magazzino_mp_evento_delta(p_tipo, v_qty, p_da, p_a, null::smallint, null::uuid) d;
  if v_delta_disponibile is distinct from 0 then
    raise exception 'La decisione non usa il disponibile.';
  end if;

  insert into public.magazzino_mp_lotto_eventi (
    lotto_id, tipo, quantita, unita, da_stato, a_stato, chiave, motivazione,
    created_by, updated_by
  ) values (
    p_lotto_id, p_tipo, v_qty, v_unita, p_da, p_a, v_chiave, v_motivazione,
    v_uid, v_uid
  )
  returning id into v_evento;

  insert into public.audit_log (entity_type, entity_id, action, actor_id, summary, payload)
  values (
    'magazzino_mp_lotti',
    p_lotto_id,
    'create',
    v_uid,
    'Decisione lotto ' || p_tipo || ' · ' || v_qty || ' ' || v_unita,
    jsonb_build_object(
      'evento_id', v_evento,
      'lotto_id', p_lotto_id,
      'tipo', p_tipo,
      'da', p_da,
      'a', p_a,
      'quantita', v_qty,
      'chiave', v_chiave
    )
  );

  return jsonb_build_object(
    'evento_id', v_evento,
    'lotto_id', p_lotto_id,
    'riusata', false,
    'tipo', p_tipo,
    'da', p_da,
    'a', p_a
  );
end;
$$;

create or replace function public.magazzino_mp_blocca_lotto(
  p_lotto_id uuid,
  p_quantita numeric,
  p_chiave text,
  p_motivazione text
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
begin
  return public.magazzino_mp_decidi_lotto(
    p_lotto_id, 'blocco', 'in_controllo', 'bloccata', p_quantita, p_chiave, p_motivazione
  );
end;
$$;

create or replace function public.magazzino_mp_sblocca_lotto(
  p_lotto_id uuid,
  p_quantita numeric,
  p_chiave text,
  p_motivazione text
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
begin
  return public.magazzino_mp_decidi_lotto(
    p_lotto_id, 'sblocco', 'bloccata', 'in_controllo', p_quantita, p_chiave, p_motivazione
  );
end;
$$;

create or replace function public.magazzino_mp_respingi_lotto(
  p_lotto_id uuid,
  p_quantita numeric,
  p_chiave text,
  p_motivazione text,
  p_da_stato text
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
begin
  if p_da_stato not in ('in_controllo', 'bloccata') then
    raise exception 'Transizione non consentita.';
  end if;
  return public.magazzino_mp_decidi_lotto(
    p_lotto_id, 'respingimento', p_da_stato, 'respinta_presente',
    p_quantita, p_chiave, p_motivazione
  );
end;
$$;

create or replace function public.magazzino_mp_uscita_respinta_lotto(
  p_lotto_id uuid,
  p_quantita numeric,
  p_chiave text,
  p_motivazione text
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
begin
  return public.magazzino_mp_decidi_lotto(
    p_lotto_id, 'uscita_respinta', 'respinta_presente', 'respinta_uscita',
    p_quantita, p_chiave, p_motivazione
  );
end;
$$;

reset role;

revoke create on schema public from magazzino_mp_decisione;

revoke all on function public.magazzino_mp_decidi_lotto(uuid, text, text, text, numeric, text, text)
  from public, anon, authenticated, service_role;
revoke all on function public.magazzino_mp_blocca_lotto(uuid, numeric, text, text)
  from public, anon, authenticated, service_role;
revoke all on function public.magazzino_mp_sblocca_lotto(uuid, numeric, text, text)
  from public, anon, authenticated, service_role;
revoke all on function public.magazzino_mp_respingi_lotto(uuid, numeric, text, text, text)
  from public, anon, authenticated, service_role;
revoke all on function public.magazzino_mp_uscita_respinta_lotto(uuid, numeric, text, text)
  from public, anon, authenticated, service_role;

grant execute on function public.magazzino_mp_blocca_lotto(uuid, numeric, text, text) to authenticated;
grant execute on function public.magazzino_mp_sblocca_lotto(uuid, numeric, text, text) to authenticated;
grant execute on function public.magazzino_mp_respingi_lotto(uuid, numeric, text, text, text) to authenticated;
grant execute on function public.magazzino_mp_uscita_respinta_lotto(uuid, numeric, text, text) to authenticated;

comment on role magazzino_mp_decisione is
  'Proprietario delle decisioni qualitative sui lotti. Non muove la giacenza e non usa il disponibile.';
comment on function public.magazzino_mp_uscita_respinta_lotto(uuid, numeric, text, text) is
  'Registra l''uscita fisica di materiale già respinto. Magazzino, Produzione o superadmin. Non era disponibile e non genera un movimento.';
comment on function public.magazzino_mp_sblocca_lotto(uuid, numeric, text, text) is
  'Riporta in controllo un lotto bloccato. Solo Produzione o superadmin.';

do $$
begin
  if has_schema_privilege('magazzino_mp_decisione', 'public', 'CREATE') then
    raise exception 'Il ruolo delle decisioni non deve creare oggetti.';
  end if;
  if has_table_privilege('magazzino_mp_decisione', 'public.magazzino_mp_lotti', 'INSERT')
     or has_table_privilege('magazzino_mp_decisione', 'public.magazzino_mp_lotto_eventi', 'UPDATE')
     or has_table_privilege('magazzino_mp_decisione', 'public.magazzino_movimenti', 'INSERT')
     or has_table_privilege('magazzino_mp_decisione', 'public.magazzino_giacenze', 'UPDATE')
     or has_table_privilege('magazzino_mp_decisione', 'public.haccp_fogli_ingresso', 'UPDATE')
     or has_table_privilege('authenticated', 'public.magazzino_mp_lotto_eventi', 'INSERT')
     or has_function_privilege(
          'authenticated',
          'public.magazzino_mp_decidi_lotto(uuid,text,text,text,numeric,text,text)',
          'EXECUTE'
        ) then
    raise exception 'Privilegi delle decisioni troppo ampi.';
  end if;
end $$;
