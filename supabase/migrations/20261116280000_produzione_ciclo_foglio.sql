-- Ciclo di produzione: il prelievo LM- resta sul foglio, la scaletta si collega
-- al foglio aperto e la macchina si associa solo in prova, senza comandi.

grant usage, create on schema public to magazzino_mp_collegamento;
grant magazzino_mp_collegamento to current_user;
set local role magazzino_mp_collegamento;

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
  v_mov_foglio uuid;
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
    select m.id, m.tipo, m.quantita_kg, m.foglio_id
      into v_mov, v_mov_tipo, v_mov_qty, v_mov_foglio
    from public.magazzino_movimenti m
    where m.lotto_evento_id = v_evento
      and m.deleted_at is null;
    if v_evento_tipo is distinct from 'consumo_uscita'
       or v_evento_qty is distinct from v_qty
       or v_evento_lotto is distinct from p_lotto_id
       or v_mov is null
       or v_mov_tipo is distinct from 'scarico'
       or v_mov_qty is distinct from v_qty
       or (v_mov_foglio is not null and v_mov_foglio is distinct from p_foglio_lavorazione_id) then
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
    lotto_evento_id, registro_classe, foglio_id, created_by, updated_by
  ) values (
    'materia_prima', v_materia, v_codice_mp, 'scarico', v_qty, v_unita,
    '', 'prelievo-mp', left('Prelievo ' || v_codice || ' · ' || v_foglio_codice, 500),
    v_chiave, false, v_evento, 'lotto', p_foglio_lavorazione_id, v_uid, v_uid
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

comment on function public.magazzino_mp_preleva_lotto(uuid, numeric, text, uuid) is
  'Scarica solo quantità già disponibile di un lotto LM- e conserva il foglio di lavorazione sul movimento.';

alter table public.produzione_calendario_impegni
  add column if not exists foglio_lavorazione_id uuid
    references public.produzione_fogli_lavorazione (id);

comment on column public.produzione_calendario_impegni.foglio_lavorazione_id is
  'Foglio di lavorazione assegnato all''impegno. Non cambia lo stato dell''ordine.';

create index if not exists produzione_cal_impegni_foglio_idx
  on public.produzione_calendario_impegni (foglio_lavorazione_id)
  where deleted_at is null and foglio_lavorazione_id is not null;

create table if not exists public.produzione_foglio_macchine (
  id uuid primary key default gen_random_uuid(),
  foglio_id uuid not null references public.produzione_fogli_lavorazione (id),
  macchinario_id uuid not null references public.produzione_macchinari (id),
  modalita text not null default 'prova'
    check (modalita = 'prova'),
  protocollo text not null default ''
    check (protocollo in ('', 'POWER_ON,POWER_OFF')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  created_by uuid references auth.users (id) on delete set null,
  updated_by uuid references auth.users (id) on delete set null,
  deleted_at timestamptz,
  deleted_by uuid references auth.users (id) on delete set null
);

create unique index if not exists produzione_foglio_macchine_uidx
  on public.produzione_foglio_macchine (foglio_id, macchinario_id)
  where deleted_at is null;

comment on table public.produzione_foglio_macchine is
  'Associazione di prova tra foglio e macchina. Non accoda comandi e non cambia lo stato IoT.';

drop trigger if exists produzione_foglio_macchine_updated_at
  on public.produzione_foglio_macchine;
create trigger produzione_foglio_macchine_updated_at
  before update on public.produzione_foglio_macchine
  for each row execute function public.set_updated_at();

alter table public.produzione_foglio_macchine enable row level security;
drop policy if exists produzione_foglio_macchine_all on public.produzione_foglio_macchine;
create policy produzione_foglio_macchine_all
  on public.produzione_foglio_macchine for all to authenticated
  using (
    public.is_superadmin()
    or public.has_area_access('produzione')
    or public.has_area_access('magazzino')
    or public.has_area_access('amministrazione')
  )
  with check (
    public.is_superadmin()
    or public.has_area_access('produzione')
    or public.has_area_access('magazzino')
    or public.has_area_access('amministrazione')
  );
grant select, insert, update on public.produzione_foglio_macchine to authenticated;
revoke delete on public.produzione_foglio_macchine from authenticated;

create or replace function public.produzione_collega_impegno_foglio(
  p_impegno_id uuid,
  p_foglio_id uuid
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_uid uuid;
  v_stato text;
begin
  v_uid := public.app_effective_uid();
  if v_uid is null then
    raise exception 'Accesso non autenticato.';
  end if;
  if not (
    public.is_superadmin()
    or public.has_area_access('produzione')
    or public.has_area_access('amministrazione')
  ) then
    raise exception 'Non autorizzato a collegare la lavorazione.';
  end if;
  if p_foglio_id is not null then
    select f.stato into v_stato
    from public.produzione_fogli_lavorazione f
    where f.id = p_foglio_id
      and f.deleted_at is null;
    if v_stato is distinct from 'aperto' then
      raise exception 'Il foglio di lavorazione non è aperto.';
    end if;
  end if;
  update public.produzione_calendario_impegni
    set foglio_lavorazione_id = p_foglio_id,
        updated_by = v_uid
  where id = p_impegno_id
    and deleted_at is null;
  if not found then
    raise exception 'Impegno non disponibile.';
  end if;
  return jsonb_build_object('impegno_id', p_impegno_id, 'foglio_id', p_foglio_id);
end;
$$;

revoke all on function public.produzione_collega_impegno_foglio(uuid, uuid)
  from public, anon, authenticated, service_role;
grant execute on function public.produzione_collega_impegno_foglio(uuid, uuid) to authenticated;

create or replace view public.produzione_foglio_ciclo
with (security_invoker = true) as
select
  f.id as foglio_id,
  f.codice as foglio_codice,
  f.stato as foglio_stato,
  f.prodotto,
  f.started_at,
  f.expected_end_at,
  f.closed_at,
  f.lotto_esterno_id,
  le.codice as lotto_uscita_codice,
  m.id as movimento_id,
  m.quantita_kg as quantita_prelevata,
  m.unita as unita_prelievo,
  m.created_at as prelevato_at,
  e.id as evento_id,
  l.id as lotto_mp_id,
  l.codice as lotto_mp_codice
from public.produzione_fogli_lavorazione f
left join public.lotti_esterni le on le.id = f.lotto_esterno_id
left join public.magazzino_movimenti m
  on m.foglio_id = f.id
 and m.deleted_at is null
 and m.registro_classe = 'lotto'
 and m.riferimento = 'prelievo-mp'
 and m.tipo = 'scarico'
left join public.magazzino_mp_lotto_eventi e on e.id = m.lotto_evento_id
left join public.magazzino_mp_lotti l on l.id = e.lotto_id
where f.deleted_at is null;

comment on view public.produzione_foglio_ciclo is
  'Catena lotto LM-, prelievo, foglio e lotto di uscita già esistente. Non crea giacenze.';

grant select on public.produzione_foglio_ciclo to authenticated;

do $$
declare
  v_def text;
begin
  if has_schema_privilege('magazzino_mp_collegamento', 'public', 'CREATE') then
    raise exception 'Il ruolo di collegamento non deve creare oggetti.';
  end if;
  v_def := pg_get_functiondef(
    'public.magazzino_mp_preleva_lotto(uuid, numeric, text, uuid)'::regprocedure
  );
  if position('foglio_id' in v_def) = 0 then
    raise exception 'Il prelievo non conserva il foglio.';
  end if;
  if position('iot_commands' in v_def) > 0 or position('POWER_ON' in v_def) > 0 then
    raise exception 'Il prelievo non deve comandare macchine.';
  end if;
  if (
    select r.rolname
    from pg_proc p
    join pg_roles r on r.oid = p.proowner
    where p.proname = 'magazzino_mp_preleva_lotto'
  ) is distinct from 'magazzino_mp_collegamento' then
    raise exception 'Proprietario del prelievo inatteso.';
  end if;
end $$;
