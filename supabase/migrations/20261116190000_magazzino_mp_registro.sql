-- Registro movimenti materie prime.
-- Non riscrive giacenze storiche, non crea lotti e non tocca Agrinsicilia
-- né i prodotti di consumo. La scrittura del saldo è consentita solo
-- all'interno delle funzioni di questo file: il controllo usa il proprietario
-- della funzione, non un parametro di sessione impostabile dal client.

alter table public.magazzino_movimenti
  add column if not exists chiave_idempotenza text;

comment on column public.magazzino_movimenti.chiave_idempotenza is
  'Chiave di idempotenza dei movimenti materie prime. Vuota per gli altri cataloghi.';

create unique index if not exists magazzino_movimenti_mp_chiave_uidx
  on public.magazzino_movimenti (chiave_idempotenza)
  where catalog_kind = 'materia_prima'
    and chiave_idempotenza is not null
    and deleted_at is null;

create table if not exists public.magazzino_mp_operazioni (
  id uuid primary key default gen_random_uuid(),
  chiave text not null,
  tipo text not null check (tipo in ('pulizia_test')),
  esito jsonb not null,
  created_at timestamptz not null default now(),
  created_by uuid
);

create unique index if not exists magazzino_mp_operazioni_chiave_uidx
  on public.magazzino_mp_operazioni (chiave);

comment on table public.magazzino_mp_operazioni is
  'Registro delle pulizie di test delle materie prime. Non è una giacenza e non contiene movimenti inventati.';

alter table public.magazzino_mp_operazioni enable row level security;
revoke all on table public.magazzino_mp_operazioni from public, anon, authenticated;

-- Produzione legge i movimenti delle sole materie prime, così la vista
-- di riconciliazione non nasconde i movimenti già esistenti.
drop policy if exists "magazzino_movimenti_select_mp_produzione"
  on public.magazzino_movimenti;
create policy "magazzino_movimenti_select_mp_produzione"
  on public.magazzino_movimenti for select
  to authenticated
  using (
    catalog_kind = 'materia_prima'
    and deleted_at is null
    and public.has_area_access('produzione')
  );

create or replace function public.magazzino_mp_esecutore_registro()
returns boolean
language sql
stable
security invoker
set search_path = public
as $$
  select exists (
    select 1
    from pg_proc p
    join pg_namespace n on n.oid = p.pronamespace
    join pg_roles r on r.oid = p.proowner
    where n.nspname = 'public'
      and p.proname = 'magazzino_mp_registra_movimento'
      and r.rolname = current_user
  );
$$;

comment on function public.magazzino_mp_esecutore_registro() is
  'Vero solo mentre esegue il proprietario della funzione di registro. Il client non può assumere quel ruolo.';

revoke all on function public.magazzino_mp_esecutore_registro() from public, anon;
grant execute on function public.magazzino_mp_esecutore_registro() to authenticated, service_role;

create or replace function public.magazzino_giacenze_proteggi_mp()
returns trigger
language plpgsql
security invoker
set search_path = public
as $$
declare
  v_registro boolean;
begin
  if tg_op = 'DELETE' then
    if old.catalog_kind = 'materia_prima' then
      raise exception 'La giacenza di una materia prima non si cancella fisicamente.';
    end if;
    return old;
  end if;

  if tg_op = 'INSERT' then
    if new.catalog_kind = 'materia_prima' and new.quantita_kg <> 0 then
      if not public.magazzino_mp_esecutore_registro() then
        raise exception 'La giacenza di una materia prima si aggiorna solo registrando un movimento.';
      end if;
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

  v_registro := public.magazzino_mp_esecutore_registro();

  if new.quantita_kg is distinct from old.quantita_kg and not v_registro then
    raise exception 'La quantità di una materia prima non si modifica direttamente. Registra un movimento.';
  end if;

  if new.unita is distinct from old.unita and not v_registro then
    raise exception 'L''unità della giacenza materia prima non si modifica da questa scheda.';
  end if;

  if old.is_test is distinct from new.is_test and not v_registro then
    raise exception 'Il flag di test della giacenza materia prima non si modifica.';
  end if;

  if new.deleted_at is distinct from old.deleted_at then
    if new.quantita_kg is distinct from old.quantita_kg then
      raise exception 'Non si azzera una giacenza materia prima diversa da zero.';
    end if;
    if not v_registro and old.quantita_kg <> 0 then
      raise exception 'Non si elimina una giacenza materia prima diversa da zero.';
    end if;
    if v_registro and old.is_test is not true then
      raise exception 'La pulizia riguarda solo le giacenze di test.';
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

drop trigger if exists magazzino_giacenze_proteggi_mp on public.magazzino_giacenze;
create trigger magazzino_giacenze_proteggi_mp
  before insert or update or delete on public.magazzino_giacenze
  for each row execute function public.magazzino_giacenze_proteggi_mp();

create or replace function public.magazzino_movimenti_proteggi_mp()
returns trigger
language plpgsql
security invoker
set search_path = public
as $$
begin
  if tg_op = 'DELETE' then
    if old.catalog_kind = 'materia_prima' then
      raise exception 'Un movimento di materia prima non si cancella fisicamente.';
    end if;
    return old;
  end if;

  if tg_op = 'INSERT' then
    if new.catalog_kind = 'materia_prima'
       and not public.magazzino_mp_esecutore_registro() then
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
    if not public.magazzino_mp_esecutore_registro() then
      raise exception 'Un movimento di materia prima non si elimina.';
    end if;
    if old.is_test is not true then
      raise exception 'Si possono chiudere solo i movimenti di test delle materie prime.';
    end if;
  end if;

  return new;
end;
$$;

drop trigger if exists magazzino_movimenti_proteggi_mp on public.magazzino_movimenti;
create trigger magazzino_movimenti_proteggi_mp
  before insert or update or delete on public.magazzino_movimenti
  for each row execute function public.magazzino_movimenti_proteggi_mp();

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
    and m.deleted_at is null
  for update;

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
  where mp.id = p_prodotto_id
  for share;

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
    catalog_kind,
    prodotto_id,
    prodotto_codice,
    tipo,
    quantita_kg,
    unita,
    barcode_letto,
    riferimento,
    note,
    chiave_idempotenza,
    is_test,
    created_by,
    updated_by
  ) values (
    'materia_prima',
    p_prodotto_id,
    v_codice,
    v_tipo,
    v_qty,
    v_unita,
    left(btrim(coalesce(p_barcode, '')), 128),
    'movimento-mp',
    left(btrim(coalesce(p_note, '')), 500),
    v_chiave,
    false,
    v_uid,
    v_uid
  )
  returning id into v_mov;

  if v_giacenza is null then
    insert into public.magazzino_giacenze (
      catalog_kind,
      prodotto_id,
      prodotto_codice,
      quantita_kg,
      unita,
      is_test,
      created_by,
      updated_by
    ) values (
      'materia_prima',
      p_prodotto_id,
      v_codice,
      v_dopo,
      v_unita,
      false,
      v_uid,
      v_uid
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

comment on function public.magazzino_mp_registra_movimento(uuid, text, numeric, text, text, text, text) is
  'Registra in modo atomico il movimento di una materia prima e aggiorna la giacenza. Non converte le unità.';

revoke all on function public.magazzino_mp_registra_movimento(uuid, text, numeric, text, text, text, text)
  from public, anon;
grant execute on function public.magazzino_mp_registra_movimento(uuid, text, numeric, text, text, text, text)
  to authenticated;

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

  select o.esito
    into v_esito
  from public.magazzino_mp_operazioni o
  where o.chiave = v_chiave;

  if v_esito is not null then
    return v_esito || jsonb_build_object('ripetuta', true);
  end if;

  perform pg_advisory_xact_lock(hashtextextended('mp-pulizia-righe', 0));

  select count(*)
    into v_lasciati
  from public.magazzino_movimenti m
  where m.catalog_kind = 'materia_prima'
    and m.is_test
    and m.deleted_at is null
    and exists (
      select 1
      from public.magazzino_giacenze g
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
        select 1
        from public.magazzino_giacenze g
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
    'magazzino_mp_operazioni',
    v_id,
    'soft_delete',
    v_uid,
    'Pulizia dati di test del magazzino materie prime',
    v_esito
  );

  return v_esito;
end;
$$;

comment on function public.magazzino_mp_pulisci_test(text) is
  'Chiude solo giacenze e movimenti di test delle materie prime, senza cambiare le quantità registrate e senza toccare i saldi operativi.';

revoke all on function public.magazzino_mp_pulisci_test(text) from public, anon;
grant execute on function public.magazzino_mp_pulisci_test(text) to authenticated;

create or replace view public.magazzino_mp_riconciliazione
with (security_invoker = true) as
select
  g.id as giacenza_id,
  g.prodotto_id,
  mp.codice,
  mp.nome,
  g.quantita_kg as saldo_registrato,
  g.unita as unita_giacenza,
  mp.unita_misura as unita_anagrafica,
  coalesce(m.somma_movimenti, 0)::numeric(14, 3) as somma_movimenti,
  (g.quantita_kg - coalesce(m.somma_movimenti, 0))::numeric(14, 3) as scostamento_non_verificato,
  (mp.unita_misura is not null and mp.unita_misura = g.unita) as unita_allineata
from public.magazzino_giacenze g
join public.materie_prime mp
  on mp.id = g.prodotto_id
 and mp.deleted_at is null
left join (
  select
    prodotto_id,
    sum(
      case
        when tipo in ('scarico', 'uscita_produzione') then -abs(quantita_kg)
        else quantita_kg
      end
    ) as somma_movimenti
  from public.magazzino_movimenti
  where catalog_kind = 'materia_prima'
    and deleted_at is null
  group by prodotto_id
) m on m.prodotto_id = g.prodotto_id
where g.catalog_kind = 'materia_prima'
  and g.deleted_at is null;

comment on view public.magazzino_mp_riconciliazione is
  'Sola lettura. Lo scostamento è la parte di saldo non spiegata dai movimenti esistenti: non è un movimento e non viene scritta sulla giacenza.';

revoke all on table public.magazzino_mp_riconciliazione from public, anon;
grant select on table public.magazzino_mp_riconciliazione to authenticated;
