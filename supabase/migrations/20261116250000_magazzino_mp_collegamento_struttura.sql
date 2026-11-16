-- Struttura del collegamento fra eventi di lotto e movimenti.
-- Non registra accettazioni, consumi o ingressi. Il registro pubblico resta com'è.
-- Le righe già presenti restano con classe nulla e senza evento.

alter table public.magazzino_movimenti
  add column if not exists lotto_evento_id uuid,
  add column if not exists registro_classe text;

alter table public.magazzino_movimenti
  drop constraint if exists magazzino_movimenti_lotto_evento_fk;
alter table public.magazzino_movimenti
  add constraint magazzino_movimenti_lotto_evento_fk
  foreign key (lotto_evento_id)
  references public.magazzino_mp_lotto_eventi (id);

alter table public.magazzino_movimenti
  drop constraint if exists magazzino_movimenti_lotto_evento_key;
alter table public.magazzino_movimenti
  add constraint magazzino_movimenti_lotto_evento_key
  unique (lotto_evento_id);

alter table public.magazzino_movimenti
  drop constraint if exists magazzino_movimenti_registro_classe_check;
alter table public.magazzino_movimenti
  add constraint magazzino_movimenti_registro_classe_check
  check (
    (
      lotto_evento_id is null
      and (
        registro_classe is null
        or (catalog_kind = 'materia_prima' and registro_classe = 'senza_lotto')
      )
    )
    or (
      catalog_kind = 'materia_prima'
      and lotto_evento_id is not null
      and registro_classe = 'lotto'
      and is_test is false
    )
  );

comment on column public.magazzino_movimenti.lotto_evento_id is
  'Evento di lotto collegato all''inserimento. Nullo per lo storico e per i movimenti senza lotto. Non si aggiorna dopo.';
comment on column public.magazzino_movimenti.registro_classe is
  'Nulla sulle righe storiche. senza_lotto per un movimento nuovo non collegato. lotto solo insieme all''evento.';

create or replace function public.magazzino_movimenti_lotto_evento_coerente()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_tipo text;
  v_quantita numeric;
  v_unita text;
  v_riferimento uuid;
  v_materia uuid;
  v_lotto_chiuso timestamptz;
  v_tipo_riferimento text;
begin
  if tg_op = 'UPDATE' then
    if new.lotto_evento_id is not distinct from old.lotto_evento_id
       and new.registro_classe is not distinct from old.registro_classe then
      return new;
    end if;
    raise exception 'Il collegamento del movimento non si modifica.';
  end if;

  if new.lotto_evento_id is null then
    if new.registro_classe = 'lotto' then
      raise exception 'Un movimento di lotto richiede l''evento.';
    end if;
    return new;
  end if;

  select e.tipo, e.quantita, e.unita, e.evento_riferimento_id,
         l.materia_prima_id, l.deleted_at, r.tipo
    into v_tipo, v_quantita, v_unita, v_riferimento,
         v_materia, v_lotto_chiuso, v_tipo_riferimento
  from public.magazzino_mp_lotto_eventi e
  join public.magazzino_mp_lotti l on l.id = e.lotto_id
  left join public.magazzino_mp_lotto_eventi r on r.id = e.evento_riferimento_id
  where e.id = new.lotto_evento_id
    and e.xmin::text::bigint = (txid_current() % 4294967296)::bigint;

  if v_tipo is null then
    if exists (
      select 1 from public.magazzino_mp_lotto_eventi e
      where e.id = new.lotto_evento_id
    ) then
      raise exception 'L''evento non appartiene a questa operazione.';
    end if;
    raise exception 'Evento inesistente.';
  end if;

  if v_lotto_chiuso is not null then
    raise exception 'Lotto non disponibile.';
  end if;
  if new.catalog_kind is distinct from 'materia_prima'
     or new.registro_classe is distinct from 'lotto'
     or new.is_test is true then
    raise exception 'Movimento di lotto non valido.';
  end if;
  if v_materia is distinct from new.prodotto_id then
    raise exception 'L''evento appartiene a un''altra materia.';
  end if;
  if v_unita is distinct from new.unita
     or v_quantita is distinct from new.quantita_kg then
    raise exception 'L''evento non coincide con il movimento.';
  end if;

  if v_tipo = 'accettazione' and new.tipo = 'carico' then
    null;
  elsif v_tipo = 'consumo_uscita' and new.tipo = 'scarico' then
    null;
  elsif v_tipo = 'rettifica_evento'
        and v_tipo_riferimento = 'accettazione'
        and new.tipo = 'scarico' then
    null;
  elsif v_tipo = 'rettifica_evento'
        and v_tipo_riferimento = 'consumo_uscita'
        and new.tipo = 'carico' then
    null;
  else
    raise exception 'Evento non pertinente al movimento.';
  end if;

  if exists (
    select 1 from public.magazzino_movimenti m
    where m.lotto_evento_id = new.lotto_evento_id
      and m.id is distinct from new.id
  ) then
    raise exception 'L''evento è già collegato a un movimento.';
  end if;

  return new;
end;
$$;

revoke all on function public.magazzino_movimenti_lotto_evento_coerente()
  from public, anon, authenticated, service_role;

drop trigger if exists magazzino_movimenti_lotto_evento_coerente
  on public.magazzino_movimenti;
create trigger magazzino_movimenti_lotto_evento_coerente
  before insert or update on public.magazzino_movimenti
  for each row execute function public.magazzino_movimenti_lotto_evento_coerente();

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

revoke all on function public.magazzino_movimenti_proteggi_mp()
  from public, anon, authenticated;

grant usage, create on schema public to magazzino_mp_pulizia;
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
    and m.lotto_evento_id is null
    and m.registro_classe is distinct from 'lotto'
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
        and m.lotto_evento_id is null
        and m.registro_classe is distinct from 'lotto'
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

reset role;
revoke create on schema public from magazzino_mp_pulizia;

revoke all on function public.magazzino_mp_pulisci_test(text) from public, anon;
grant execute on function public.magazzino_mp_pulisci_test(text) to authenticated;

drop view if exists public.magazzino_mp_lotti_riconciliazione;
create view public.magazzino_mp_lotti_riconciliazione
with (security_invoker = true) as
select
  r.prodotto_id,
  r.codice,
  r.saldo_registrato,
  r.somma_movimenti,
  r.scostamento_non_verificato as scostamento_non_verificato,
  r.scostamento_non_verificato as storico_non_attribuito,
  coalesce(b.storici, 0)::numeric(14, 3) as movimenti_storici_senza_lotto,
  coalesce(b.nuovi, 0)::numeric(14, 3) as movimenti_nuovi_senza_lotto,
  coalesce(b.collegati, 0)::numeric(14, 3) as movimenti_collegati_lotto,
  coalesce(q.disponibile, 0)::numeric(14, 3) as disponibile_lotti,
  coalesce(q.fisica, 0)::numeric(14, 3) as fisica_lotti,
  (
    r.saldo_registrato
      = r.scostamento_non_verificato
        + coalesce(b.storici, 0)
        + coalesce(b.nuovi, 0)
        + coalesce(b.collegati, 0)
  ) as identita_saldo,
  (
    r.somma_movimenti
      = coalesce(b.storici, 0)
        + coalesce(b.nuovi, 0)
        + coalesce(b.collegati, 0)
  ) as partizione_movimenti
from public.magazzino_mp_riconciliazione r
left join (
  select
    m.prodotto_id,
    sum(
      case
        when m.lotto_evento_id is null and m.registro_classe is null then
          case
            when m.tipo in ('scarico', 'uscita_produzione') then -abs(m.quantita_kg)
            else m.quantita_kg
          end
        else 0
      end
    ) as storici,
    sum(
      case
        when m.lotto_evento_id is null and m.registro_classe = 'senza_lotto' then
          case
            when m.tipo in ('scarico', 'uscita_produzione') then -abs(m.quantita_kg)
            else m.quantita_kg
          end
        else 0
      end
    ) as nuovi,
    sum(
      case
        when m.lotto_evento_id is not null and m.registro_classe = 'lotto' then
          case
            when m.tipo in ('scarico', 'uscita_produzione') then -abs(m.quantita_kg)
            else m.quantita_kg
          end
        else 0
      end
    ) as collegati
  from public.magazzino_movimenti m
  where m.catalog_kind = 'materia_prima'
    and m.deleted_at is null
  group by m.prodotto_id
) b on b.prodotto_id = r.prodotto_id
left join (
  select
    materia_prima_id as prodotto_id,
    sum(quantita_disponibile) as disponibile,
    sum(quantita_fisica_residua) as fisica
  from public.magazzino_mp_lotto_quantita
  group by materia_prima_id
) q on q.prodotto_id = r.prodotto_id;

comment on view public.magazzino_mp_lotti_riconciliazione is
  'Separa movimenti storici, movimenti nuovi senza lotto, movimenti collegati e scostamento non verificato. Il disponibile del lotto non entra nel saldo.';

revoke all on table public.magazzino_mp_lotti_riconciliazione from public, anon;
grant select on table public.magazzino_mp_lotti_riconciliazione to authenticated;

do $$
declare
  v_def text;
begin
  if has_schema_privilege('magazzino_mp_movimento', 'public', 'create')
     or has_schema_privilege('magazzino_mp_pulizia', 'public', 'create')
     or has_schema_privilege('magazzino_mp_identificazione', 'public', 'create')
     or has_schema_privilege('magazzino_mp_decisione', 'public', 'create') then
    raise exception 'Un ruolo tecnico ha ancora CREATE.';
  end if;
  if has_table_privilege('authenticated', 'public.magazzino_mp_lotto_eventi', 'insert')
     or has_table_privilege('magazzino_mp_movimento', 'public.magazzino_mp_lotto_eventi', 'insert')
     or has_table_privilege('magazzino_mp_pulizia', 'public.magazzino_movimenti', 'insert') then
    raise exception 'Privilegio di scrittura non previsto.';
  end if;
  select pg_get_functiondef(
    'public.magazzino_mp_registra_movimento(uuid,text,numeric,text,text,text,text)'::regprocedure
  ) into v_def;
  if v_def ilike '%lotto_evento_id%' or v_def ilike '%registro_classe%' then
    raise exception 'Il registro pubblico non deve conoscere il collegamento.';
  end if;
  if (
    select r.rolname
    from pg_proc p
    join pg_roles r on r.oid = p.proowner
    where p.oid = 'public.magazzino_mp_registra_movimento(uuid,text,numeric,text,text,text,text)'::regprocedure
  ) is distinct from 'magazzino_mp_movimento' then
    raise exception 'Il proprietario del registro pubblico è cambiato.';
  end if;
  if (
    select r.rolname
    from pg_proc p
    join pg_roles r on r.oid = p.proowner
    where p.oid = 'public.magazzino_mp_pulisci_test(text)'::regprocedure
  ) is distinct from 'magazzino_mp_pulizia' then
    raise exception 'Il proprietario della pulizia è cambiato.';
  end if;
end $$;
