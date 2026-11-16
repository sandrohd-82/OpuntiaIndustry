-- Struttura dei lotti di materia prima. Nessun movimento, nessuna giacenza,
-- nessuna deroga operativa e nessuna modifica a HACCP, carichi o fogli esistenti.
-- Le quantità si leggono dagli eventi. Il saldo storico senza lotto resta dov'è.

create sequence if not exists public.magazzino_mp_lotti_seq;

create table if not exists public.magazzino_mp_lotti (
  id uuid primary key default gen_random_uuid(),
  codice text not null unique,
  materia_prima_id uuid not null references public.materie_prime (id),
  fornitore_id uuid not null references public.fornitori (id),
  unita text not null,
  codice_fornitore text,
  carico_riga_id uuid references public.approvvigionamenti_carichi_righe (id),
  haccp_foglio_id uuid references public.haccp_fogli_ingresso (id),
  foglio_ingresso_mp_id uuid references public.produzione_fogli_ingresso_mp (id),
  ddt_numero text,
  ddt_data date,
  ubicazione_id uuid references public.magazzino_ubicazioni (id),
  is_test boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  created_by uuid,
  updated_by uuid,
  deleted_at timestamptz,
  deleted_by uuid,
  constraint magazzino_mp_lotti_codice_check
    check (codice ~ '^LM-[0-9]{2}-[0-9]{4,}$'),
  constraint magazzino_mp_lotti_unita_check
    check (unita in ('kg', 'g', 'lt', 'ml', 'pz')),
  constraint magazzino_mp_lotti_codice_fornitore_check
    check (codice_fornitore is null or char_length(btrim(codice_fornitore)) between 1 and 40),
  constraint magazzino_mp_lotti_origine_check check (
    (
      carico_riga_id is not null
      and haccp_foglio_id is not null
      and foglio_ingresso_mp_id is null
    )
    or (
      carico_riga_id is null
      and haccp_foglio_id is null
      and foglio_ingresso_mp_id is not null
    )
  )
);

create unique index if not exists magazzino_mp_lotti_fornitore_riga_uidx
  on public.magazzino_mp_lotti (carico_riga_id, lower(btrim(codice_fornitore)))
  where deleted_at is null
    and carico_riga_id is not null
    and codice_fornitore is not null;

create unique index if not exists magazzino_mp_lotti_fornitore_foglio_uidx
  on public.magazzino_mp_lotti (foglio_ingresso_mp_id, lower(btrim(codice_fornitore)))
  where deleted_at is null
    and foglio_ingresso_mp_id is not null
    and codice_fornitore is not null;

create index if not exists magazzino_mp_lotti_materia_idx
  on public.magazzino_mp_lotti (materia_prima_id)
  where deleted_at is null;

comment on table public.magazzino_mp_lotti is
  'Identità del lotto. Una sola origine: riga di carico con foglio HACCP, oppure foglio ingresso MP già esistente. Non crea documenti e non assegna lo storico.';

create table if not exists public.magazzino_mp_lotto_eventi (
  id uuid primary key default gen_random_uuid(),
  lotto_id uuid not null references public.magazzino_mp_lotti (id),
  tipo text not null,
  quantita numeric(14, 3) not null,
  unita text not null,
  da_stato text,
  a_stato text,
  segno smallint,
  sottotipo text,
  evento_riferimento_id uuid references public.magazzino_mp_lotto_eventi (id),
  chiave text not null unique,
  motivazione text not null default '',
  movimento_id uuid references public.magazzino_movimenti (id),
  ubicazione_id uuid references public.magazzino_ubicazioni (id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  created_by uuid,
  updated_by uuid,
  constraint magazzino_mp_lotto_eventi_tipo_check check (tipo in (
    'identificazione', 'accettazione', 'blocco', 'sblocco',
    'respingimento', 'consumo_uscita', 'rettifica_identita', 'rettifica_evento'
  )),
  constraint magazzino_mp_lotto_eventi_quantita_check
    check (quantita > 0 and quantita = round(quantita, 3)),
  constraint magazzino_mp_lotto_eventi_unita_check
    check (unita in ('kg', 'g', 'lt', 'ml', 'pz')),
  constraint magazzino_mp_lotto_eventi_stato_check check (
    (da_stato is null or da_stato in (
      'in_controllo', 'disponibile', 'bloccata',
      'respinta_presente', 'respinta_uscita', 'consumata_uscita'
    ))
    and (a_stato is null or a_stato in (
      'in_controllo', 'disponibile', 'bloccata',
      'respinta_presente', 'respinta_uscita', 'consumata_uscita'
    ))
  ),
  constraint magazzino_mp_lotto_eventi_segno_check
    check (segno is null or segno in (-1, 1)),
  constraint magazzino_mp_lotto_eventi_sottotipo_check
    check (sottotipo is null or sottotipo in ('prelievo', 'consumo')),
  constraint magazzino_mp_lotto_eventi_chiave_check
    check (char_length(btrim(chiave)) between 8 and 200),
  constraint magazzino_mp_lotto_eventi_senza_movimento
    check (movimento_id is null)
);

create unique index if not exists magazzino_mp_lotto_eventi_movimento_uidx
  on public.magazzino_mp_lotto_eventi (movimento_id)
  where movimento_id is not null;

create index if not exists magazzino_mp_lotto_eventi_lotto_idx
  on public.magazzino_mp_lotto_eventi (lotto_id, created_at);

comment on table public.magazzino_mp_lotto_eventi is
  'Eventi append-only del lotto. Il movimento di magazzino non è collegato in questo sottopasso.';
comment on constraint magazzino_mp_lotto_eventi_senza_movimento
  on public.magazzino_mp_lotto_eventi is
  'Il registro Fase 1 non riceve ancora il lotto. Nessun movimento nasce da questi eventi.';

create table if not exists public.magazzino_mp_haccp_deroghe (
  id uuid primary key default gen_random_uuid(),
  haccp_foglio_id uuid not null references public.haccp_fogli_ingresso (id),
  carico_id uuid references public.approvvigionamenti_carichi (id),
  tipo text not null,
  voci text[] not null,
  motivazione text not null,
  deroga_riferimento_id uuid references public.magazzino_mp_haccp_deroghe (id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  created_by uuid,
  updated_by uuid,
  constraint magazzino_mp_haccp_deroghe_tipo_check
    check (tipo in ('deroga', 'revoca')),
  constraint magazzino_mp_haccp_deroghe_motivazione_check
    check (char_length(btrim(motivazione)) >= 3),
  constraint magazzino_mp_haccp_deroghe_voci_check
    check (cardinality(voci) >= 1)
);

create index if not exists magazzino_mp_haccp_deroghe_foglio_idx
  on public.magazzino_mp_haccp_deroghe (haccp_foglio_id, created_at);

comment on table public.magazzino_mp_haccp_deroghe is
  'Struttura per future deroghe HACCP. Una riga non autorizza l''accettazione: la regola sarà approvata a parte. Le 22 voci non si modificano.';

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
    case when p_tipo = 'respingimento' and p_a = 'respinta_presente' then p_quantita else 0 end,
    case when p_tipo = 'respingimento' and p_a = 'respinta_uscita' then p_quantita else 0 end,
    case when p_tipo = 'consumo_uscita' then p_quantita else 0 end;
end;
$$;

create or replace function public.magazzino_mp_lotto_conti(p_lotto uuid)
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
language sql
stable
security invoker
set search_path = public
as $$
  select
    coalesce(sum(d.identificata), 0)::numeric(14, 3),
    coalesce(sum(d.rettifica), 0)::numeric(14, 3),
    coalesce(sum(d.in_controllo), 0)::numeric(14, 3),
    coalesce(sum(d.disponibile), 0)::numeric(14, 3),
    coalesce(sum(d.bloccata), 0)::numeric(14, 3),
    coalesce(sum(d.respinta_presente), 0)::numeric(14, 3),
    coalesce(sum(d.respinta_uscita), 0)::numeric(14, 3),
    coalesce(sum(d.consumata_uscita), 0)::numeric(14, 3)
  from public.magazzino_mp_lotto_eventi e
  cross join lateral public.magazzino_mp_evento_delta(
    e.tipo, e.quantita, e.da_stato, e.a_stato, e.segno, e.evento_riferimento_id
  ) d
  where e.lotto_id = p_lotto;
$$;

create or replace function public.magazzino_mp_lotti_proteggi()
returns trigger
language plpgsql
security invoker
set search_path = public
as $$
declare
  v_unita text;
  v_fornitore uuid;
  v_materia uuid;
  v_foglio uuid;
  v_origine text;
  v_deleted timestamptz;
begin
  if tg_op = 'DELETE' then
    raise exception 'L''identità del lotto non si cancella fisicamente.';
  end if;

  new.codice_fornitore := nullif(btrim(new.codice_fornitore), '');
  new.unita := lower(btrim(new.unita));

  if tg_op = 'INSERT' and (
    (new.carico_riga_id is not null) = (new.foglio_ingresso_mp_id is not null)
    or (new.carico_riga_id is not null and new.haccp_foglio_id is null)
    or (new.foglio_ingresso_mp_id is not null and new.haccp_foglio_id is not null)
  ) then
    raise exception 'Origine del lotto non univoca.';
  end if;

  if tg_op = 'UPDATE' then
    if new.codice is distinct from old.codice
       or new.materia_prima_id is distinct from old.materia_prima_id
       or new.fornitore_id is distinct from old.fornitore_id
       or new.unita is distinct from old.unita
       or new.codice_fornitore is distinct from old.codice_fornitore
       or new.carico_riga_id is distinct from old.carico_riga_id
       or new.haccp_foglio_id is distinct from old.haccp_foglio_id
       or new.foglio_ingresso_mp_id is distinct from old.foglio_ingresso_mp_id
       or new.is_test is distinct from old.is_test
       or new.created_by is distinct from old.created_by then
      raise exception 'L''identità del lotto non si modifica.';
    end if;
    if new.deleted_at is not null and old.deleted_at is null and exists (
      select 1 from public.magazzino_mp_lotto_eventi e where e.lotto_id = old.id
    ) then
      raise exception 'Un lotto con eventi non si chiude.';
    end if;
    return new;
  end if;

  select lower(btrim(coalesce(mp.unita_misura, '')))
    into v_unita
  from public.materie_prime mp
  where mp.id = new.materia_prima_id
    and mp.deleted_at is null;
  if v_unita is null or v_unita <> new.unita then
    raise exception 'L''unità del lotto deve coincidere con l''anagrafica.';
  end if;

  if new.carico_riga_id is not null then
    select c.fornitore_id, r.materia_prima_id, c.foglio_id, c.deleted_at
      into v_fornitore, v_materia, v_foglio, v_deleted
    from public.approvvigionamenti_carichi_righe r
    join public.approvvigionamenti_carichi c on c.id = r.carico_id
    where r.id = new.carico_riga_id;
    if v_fornitore is null or v_deleted is not null then
      raise exception 'Riga di carico non disponibile.';
    end if;
    if v_materia is distinct from new.materia_prima_id
       or v_fornitore is distinct from new.fornitore_id
       or v_foglio is distinct from new.haccp_foglio_id
       or v_foglio is null then
      raise exception 'Il lotto non coincide con il carico o con il suo foglio HACCP.';
    end if;
    if exists (
      select 1
      from public.approvvigionamenti_carichi_righe r
      where r.id = new.carico_riga_id
        and lower(btrim(r.unita_misura)) is distinct from new.unita
    ) then
      raise exception 'L''unità del lotto non coincide con la riga del carico.';
    end if;
  else
    select f.fornitore_id, f.materia_prima_id, f.origine, f.deleted_at
      into v_fornitore, v_materia, v_origine, v_deleted
    from public.produzione_fogli_ingresso_mp f
    where f.id = new.foglio_ingresso_mp_id;
    if v_fornitore is null or v_deleted is not null then
      raise exception 'Foglio ingresso non disponibile.';
    end if;
    if v_origine is distinct from 'ingresso' then
      raise exception 'Il foglio di inventario non apre un lotto.';
    end if;
    if v_fornitore is distinct from new.fornitore_id
       or v_materia is distinct from new.materia_prima_id then
      raise exception 'Il lotto non coincide con il foglio ingresso.';
    end if;
  end if;

  return new;
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
      or new.evento_riferimento_id is not null then
      raise exception 'Blocco non valido.';
    end if;
  elsif new.tipo = 'sblocco' then
    if new.da_stato is distinct from 'bloccata'
       or new.a_stato is distinct from 'in_controllo'
       or new.segno is not null or new.sottotipo is not null
       or new.evento_riferimento_id is not null then
      raise exception 'Sblocco non valido.';
    end if;
  elsif new.tipo = 'respingimento' then
    if new.da_stato not in ('in_controllo', 'bloccata', 'disponibile')
       or new.a_stato not in ('respinta_presente', 'respinta_uscita')
       or char_length(btrim(new.motivazione)) < 3
       or new.segno is not null or new.sottotipo is not null
       or new.evento_riferimento_id is not null then
      raise exception 'Respingimento non valido.';
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

create or replace function public.magazzino_mp_haccp_deroghe_proteggi()
returns trigger
language plpgsql
security invoker
set search_path = public
as $$
declare
  v_voce text;
  v_tipo text;
  v_foglio uuid;
  v_carico_foglio uuid;
  v_ammesse text[] := array[
    'doc', 'mezzo', '1a', '1b', '1c', '1d', '1e',
    '2a', '2b', '2c', '2d', '2e', '2f', '2g', '2h', '2i', '2l', '2m',
    'n1', 'n2', 'p', 'q'
  ];
begin
  if tg_op <> 'INSERT' then
    raise exception 'Una deroga non si modifica e non si cancella.';
  end if;
  if new.carico_id is not null then
    select c.foglio_id into v_carico_foglio
    from public.approvvigionamenti_carichi c
    where c.id = new.carico_id
      and c.deleted_at is null;
    if v_carico_foglio is distinct from new.haccp_foglio_id then
      raise exception 'La deroga non coincide con il foglio del carico.';
    end if;
  end if;

  foreach v_voce in array new.voci loop
    if v_voce <> all (v_ammesse) then
      raise exception 'Voce HACCP non prevista.';
    end if;
  end loop;
  if (select count(*) from unnest(new.voci) x) is distinct from
     (select count(distinct x) from unnest(new.voci) x) then
    raise exception 'Voce HACCP ripetuta.';
  end if;

  if new.tipo = 'deroga' then
    if new.deroga_riferimento_id is not null then
      raise exception 'La deroga non compensa un''altra riga.';
    end if;
  elsif new.tipo = 'revoca' then
    select d.tipo, d.haccp_foglio_id
      into v_tipo, v_foglio
    from public.magazzino_mp_haccp_deroghe d
    where d.id = new.deroga_riferimento_id;
    if v_tipo is distinct from 'deroga' or v_foglio is distinct from new.haccp_foglio_id then
      raise exception 'Revoca senza deroga dello stesso foglio.';
    end if;
  else
    raise exception 'Tipo deroga non previsto.';
  end if;
  return new;
end;
$$;

drop trigger if exists magazzino_mp_lotti_proteggi on public.magazzino_mp_lotti;
create trigger magazzino_mp_lotti_proteggi
  before insert or update or delete on public.magazzino_mp_lotti
  for each row execute function public.magazzino_mp_lotti_proteggi();

drop trigger if exists magazzino_mp_lotti_updated_at on public.magazzino_mp_lotti;
create trigger magazzino_mp_lotti_updated_at
  before update on public.magazzino_mp_lotti
  for each row execute function public.set_updated_at();

drop trigger if exists magazzino_mp_lotto_eventi_proteggi on public.magazzino_mp_lotto_eventi;
create trigger magazzino_mp_lotto_eventi_proteggi
  before insert or update or delete on public.magazzino_mp_lotto_eventi
  for each row execute function public.magazzino_mp_lotto_eventi_proteggi();

drop trigger if exists magazzino_mp_haccp_deroghe_proteggi on public.magazzino_mp_haccp_deroghe;
create trigger magazzino_mp_haccp_deroghe_proteggi
  before insert or update or delete on public.magazzino_mp_haccp_deroghe
  for each row execute function public.magazzino_mp_haccp_deroghe_proteggi();

alter table public.magazzino_mp_lotti enable row level security;
alter table public.magazzino_mp_lotto_eventi enable row level security;
alter table public.magazzino_mp_haccp_deroghe enable row level security;

drop policy if exists "magazzino_mp_lotti_select" on public.magazzino_mp_lotti;
create policy "magazzino_mp_lotti_select"
  on public.magazzino_mp_lotti for select to authenticated
  using (
    deleted_at is null
    and (
      public.is_superadmin()
      or public.has_area_access('magazzino')
      or public.has_area_access('produzione')
      or public.has_area_access('amministrazione')
    )
  );

drop policy if exists "magazzino_mp_lotto_eventi_select" on public.magazzino_mp_lotto_eventi;
create policy "magazzino_mp_lotto_eventi_select"
  on public.magazzino_mp_lotto_eventi for select to authenticated
  using (
    exists (
      select 1 from public.magazzino_mp_lotti l
      where l.id = lotto_id and l.deleted_at is null
    )
    and (
      public.is_superadmin()
      or public.has_area_access('magazzino')
      or public.has_area_access('produzione')
      or public.has_area_access('amministrazione')
    )
  );

drop policy if exists "magazzino_mp_haccp_deroghe_select" on public.magazzino_mp_haccp_deroghe;
create policy "magazzino_mp_haccp_deroghe_select"
  on public.magazzino_mp_haccp_deroghe for select to authenticated
  using (
    public.is_superadmin()
    or public.has_area_access('magazzino')
    or public.has_area_access('produzione')
    or public.has_area_access('amministrazione')
  );

revoke all on table public.magazzino_mp_lotti from public, anon, authenticated;
revoke all on table public.magazzino_mp_lotto_eventi from public, anon, authenticated;
revoke all on table public.magazzino_mp_haccp_deroghe from public, anon, authenticated;
grant select on table public.magazzino_mp_lotti to authenticated;
grant select on table public.magazzino_mp_lotto_eventi to authenticated;
grant select on table public.magazzino_mp_haccp_deroghe to authenticated;

revoke all on sequence public.magazzino_mp_lotti_seq from public, anon, authenticated;
revoke all on function public.magazzino_mp_lotti_proteggi() from public, anon, authenticated;
revoke all on function public.magazzino_mp_lotto_eventi_proteggi() from public, anon, authenticated;
revoke all on function public.magazzino_mp_haccp_deroghe_proteggi() from public, anon, authenticated;

create or replace view public.magazzino_mp_lotto_quantita
with (security_invoker = true) as
select
  l.id as lotto_id,
  l.codice,
  l.materia_prima_id,
  l.fornitore_id,
  l.unita,
  l.carico_riga_id,
  l.haccp_foglio_id,
  l.foglio_ingresso_mp_id,
  c.identificata as quantita_identificata,
  c.rettifica as quantita_rettifica,
  c.in_controllo as quantita_in_controllo,
  c.disponibile as quantita_disponibile,
  c.bloccata as quantita_bloccata,
  c.respinta_presente as quantita_respinta_presente,
  c.respinta_uscita as quantita_respinta_uscita,
  (c.respinta_presente + c.respinta_uscita)::numeric(14, 3) as quantita_respinta,
  c.consumata_uscita as quantita_consumata_uscita,
  (c.in_controllo + c.disponibile + c.bloccata + c.respinta_presente)::numeric(14, 3)
    as quantita_fisica_residua,
  (
    coalesce(t.tetto, 0) - coalesce(o.occupata, 0)
  )::numeric(14, 3) as residua_non_identificata,
  (
    c.identificata + c.rettifica
      = c.in_controllo + c.disponibile + c.bloccata
        + c.respinta_presente + c.respinta_uscita + c.consumata_uscita
  ) as invariante_ok
from public.magazzino_mp_lotti l
cross join lateral public.magazzino_mp_lotto_conti(l.id) c
left join lateral (
  select case
    when l.carico_riga_id is not null then r.quantita_arrivata
    else f.quantita
  end as tetto
  from (select 1) seme
  left join public.approvvigionamenti_carichi_righe r on r.id = l.carico_riga_id
  left join public.produzione_fogli_ingresso_mp f on f.id = l.foglio_ingresso_mp_id
) t on true
left join lateral (
  select coalesce(sum(x.identificata + x.rettifica), 0) as occupata
  from public.magazzino_mp_lotti altro
  cross join lateral public.magazzino_mp_lotto_conti(altro.id) x
  where altro.deleted_at is null
    and (
      (l.carico_riga_id is not null and altro.carico_riga_id = l.carico_riga_id)
      or (l.foglio_ingresso_mp_id is not null and altro.foglio_ingresso_mp_id = l.foglio_ingresso_mp_id)
    )
) o on true
where l.deleted_at is null;

comment on view public.magazzino_mp_lotto_quantita is
  'Conti del lotto, sola lettura. La disponibile è contabile e non è ancora un saldo di magazzino. La respinta presente resta nella fisica. La residua non identificata è la parte di ingresso senza lotto.';

create or replace view public.magazzino_mp_lotti_riconciliazione
with (security_invoker = true) as
select
  r.prodotto_id,
  r.codice,
  r.saldo_registrato,
  r.somma_movimenti,
  r.scostamento_non_verificato as storico_non_attribuito,
  coalesce(v.storico_verificato, 0)::numeric(14, 3) as storico_verificato,
  coalesce(q.disponibile, 0)::numeric(14, 3) as disponibile_lotti,
  coalesce(q.fisica, 0)::numeric(14, 3) as fisica_lotti,
  coalesce(ml.disponibile_movimenti, 0)::numeric(14, 3) as disponibile_movimenti_lotto,
  (
    r.saldo_registrato
      = coalesce(v.storico_verificato, 0)
        + r.scostamento_non_verificato
        + coalesce(ml.disponibile_movimenti, 0)
  ) as identita_saldo
from public.magazzino_mp_riconciliazione r
left join (
  select
    materia_prima_id as prodotto_id,
    sum(quantita_disponibile) as disponibile,
    sum(quantita_fisica_residua) as fisica
  from public.magazzino_mp_lotto_quantita
  group by materia_prima_id
) q on q.prodotto_id = r.prodotto_id
left join (
  select
    m.prodotto_id,
    sum(
      case
        when m.tipo in ('scarico', 'uscita_produzione') then -abs(m.quantita_kg)
        else m.quantita_kg
      end
    ) as storico_verificato
  from public.magazzino_movimenti m
  where m.catalog_kind = 'materia_prima'
    and m.deleted_at is null
    and not exists (
      select 1 from public.magazzino_mp_lotto_eventi e
      where e.movimento_id = m.id
    )
  group by m.prodotto_id
) v on v.prodotto_id = r.prodotto_id
left join (
  select
    m.prodotto_id,
    sum(
      case
        when m.tipo in ('scarico', 'uscita_produzione') then -abs(m.quantita_kg)
        else m.quantita_kg
      end
    ) as disponibile_movimenti
  from public.magazzino_movimenti m
  where m.catalog_kind = 'materia_prima'
    and m.deleted_at is null
    and exists (
      select 1 from public.magazzino_mp_lotto_eventi e
      where e.movimento_id = m.id
    )
  group by m.prodotto_id
) ml on ml.prodotto_id = r.prodotto_id;

comment on view public.magazzino_mp_lotti_riconciliazione is
  'Lo storico non attribuito è lo scostamento senza movimento. Lo storico verificato sono i movimenti senza lotto. La disponibile dei lotti non entra nel saldo finché un movimento non la collega.';

revoke all on table public.magazzino_mp_lotto_quantita from public, anon;
revoke all on table public.magazzino_mp_lotti_riconciliazione from public, anon;
grant select on table public.magazzino_mp_lotto_quantita to authenticated;
grant select on table public.magazzino_mp_lotti_riconciliazione to authenticated;
grant execute on function public.magazzino_mp_evento_delta(text, numeric, text, text, smallint, uuid)
  to authenticated;
grant execute on function public.magazzino_mp_lotto_conti(uuid) to authenticated;
revoke all on function public.magazzino_mp_evento_delta(text, numeric, text, text, smallint, uuid)
  from public, anon;
revoke all on function public.magazzino_mp_lotto_conti(uuid) from public, anon;
