-- Carichi fisici collegati a una versione pubblicata.
-- Un ordine può avere più carichi. Ogni carico ha un solo foglio HACCP.
-- Lo snapshot pubblicato non si modifica. I fogli storici restano senza ordine.

alter table public.approvvigionamenti_operazioni
  drop constraint if exists approvvigionamenti_operazioni_tipo_check;
alter table public.approvvigionamenti_operazioni
  add constraint approvvigionamenti_operazioni_tipo_check
  check (tipo in (
    'crea', 'aggiorna', 'copia', 'settimana', 'piano', 'composizione',
    'pubblica', 'visione', 'carico', 'arrivo'
  ));

create or replace function public.approvvigionamento_acquisisci_operazione(
  p_chiave text,
  p_tipo text,
  p_impronta jsonb,
  p_riferimento uuid
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_id uuid;
  v_tipo text;
  v_impronta jsonb;
  v_riferimento uuid;
begin
  if p_chiave is null or length(btrim(p_chiave)) < 8 then
    raise exception 'Chiave operazione non valida';
  end if;
  if p_tipo not in (
    'crea', 'copia', 'settimana', 'piano', 'aggiorna', 'composizione',
    'pubblica', 'visione', 'carico', 'arrivo'
  ) then
    raise exception 'Tipo operazione non valido';
  end if;

  insert into public.approvvigionamenti_operazioni (
    chiave, tipo, impronta, riferimento_id, created_by
  )
  values (p_chiave, p_tipo, p_impronta, p_riferimento, public.app_effective_uid())
  on conflict (chiave) do nothing
  returning id into v_id;

  if v_id is not null then
    return v_id;
  end if;

  select tipo, impronta, riferimento_id
    into v_tipo, v_impronta, v_riferimento
  from public.approvvigionamenti_operazioni
  where chiave = p_chiave;

  if v_tipo is distinct from p_tipo
     or v_impronta is distinct from p_impronta
     or v_riferimento is distinct from p_riferimento
  then
    raise exception 'La chiave è già stata usata per un''altra operazione.';
  end if;
  return null;
end;
$$;

create sequence if not exists public.approvvigionamenti_carichi_seq;

create table if not exists public.approvvigionamenti_carichi (
  id uuid primary key default gen_random_uuid(),
  codice text not null unique,
  fornitore_id uuid not null references public.fornitori (id),
  ordine_id uuid not null references public.approvvigionamenti_ordini (id),
  versione_id uuid not null references public.approvvigionamenti_versioni (id),
  data_prevista date not null,
  data_effettiva date,
  stato text not null default 'aperto' check (stato in ('aperto', 'arrivato')),
  foglio_id uuid unique references public.haccp_fogli_ingresso (id),
  chiave text not null unique,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  created_by uuid,
  updated_by uuid,
  deleted_at timestamptz,
  deleted_by uuid
);

comment on table public.approvvigionamenti_carichi is
  'Consegna fisica di una versione pubblicata. Non segna l''ordine come consegnato e non modifica lo snapshot.';

create index if not exists approvvigionamenti_carichi_ordine_idx
  on public.approvvigionamenti_carichi (ordine_id)
  where deleted_at is null;

create index if not exists approvvigionamenti_carichi_fornitore_idx
  on public.approvvigionamenti_carichi (fornitore_id)
  where deleted_at is null;

create table if not exists public.approvvigionamenti_carichi_righe (
  id uuid primary key default gen_random_uuid(),
  carico_id uuid not null references public.approvvigionamenti_carichi (id),
  materia_prima_id uuid not null references public.materie_prime (id),
  codice text not null,
  nome text not null,
  unita_misura text not null,
  quantita_prevista numeric not null check (quantita_prevista > 0),
  quantita_arrivata numeric check (quantita_arrivata is null or quantita_arrivata >= 0),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  created_by uuid,
  updated_by uuid,
  unique (carico_id, materia_prima_id)
);

comment on table public.approvvigionamenti_carichi_righe is
  'Quantità prevista del carico e quantità arrivata. La prevista nasce dallo snapshot e non lo riscrive.';

create table if not exists public.approvvigionamenti_carichi_eventi (
  id uuid primary key default gen_random_uuid(),
  carico_id uuid not null references public.approvvigionamenti_carichi (id),
  tipo text not null check (tipo in ('creato', 'arrivo', 'correzione')),
  payload jsonb not null,
  created_at timestamptz not null default now(),
  created_by uuid
);

comment on table public.approvvigionamenti_carichi_eventi is
  'Storico append-only del carico. Una correzione non cancella l''arrivo precedente.';

create or replace function public.approvvigionamenti_carichi_evento_immutabile()
returns trigger
language plpgsql
as $$
begin
  raise exception 'Lo storico del carico non si modifica';
end;
$$;

drop trigger if exists approvvigionamenti_carichi_eventi_immutabili
  on public.approvvigionamenti_carichi_eventi;
create trigger approvvigionamenti_carichi_eventi_immutabili
  before update or delete on public.approvvigionamenti_carichi_eventi
  for each row execute function public.approvvigionamenti_carichi_evento_immutabile();

create or replace function public.approvvigionamenti_carichi_proteggi()
returns trigger
language plpgsql
as $$
begin
  if tg_op = 'DELETE' then
    raise exception 'Un carico non si elimina';
  end if;
  if new.fornitore_id is distinct from old.fornitore_id
     or new.ordine_id is distinct from old.ordine_id
     or new.versione_id is distinct from old.versione_id
     or new.chiave is distinct from old.chiave
     or new.codice is distinct from old.codice
     or new.created_by is distinct from old.created_by
  then
    raise exception 'Il collegamento del carico non si modifica';
  end if;
  if old.foglio_id is not null and new.foglio_id is distinct from old.foglio_id then
    raise exception 'Il foglio del carico non si sostituisce';
  end if;
  return new;
end;
$$;

drop trigger if exists approvvigionamenti_carichi_proteggi on public.approvvigionamenti_carichi;
create trigger approvvigionamenti_carichi_proteggi
  before update or delete on public.approvvigionamenti_carichi
  for each row execute function public.approvvigionamenti_carichi_proteggi();

drop trigger if exists approvvigionamenti_carichi_updated_at on public.approvvigionamenti_carichi;
create trigger approvvigionamenti_carichi_updated_at
  before update on public.approvvigionamenti_carichi
  for each row execute function public.set_updated_at();

create or replace function public.approvvigionamento_carico_autorizzato()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select public.is_superadmin() or public.has_area_access('produzione');
$$;

create or replace function public.crea_carico_approvvigionamento(
  p_chiave text,
  p_versione_id uuid,
  p_data_prevista date,
  p_righe jsonb
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_operazione uuid;
  v_ordine uuid;
  v_fornitore uuid;
  v_snapshot jsonb;
  v_carico uuid;
  v_codice text;
  v_foglio uuid;
  v_foglio_codice text;
  v_riga jsonb;
  v_materia uuid;
  v_qty numeric;
  v_unita text;
  v_trovata jsonb;
  v_viste integer := 0;
begin
  if not public.approvvigionamento_carico_autorizzato() then
    raise exception 'Non autorizzato a creare un carico';
  end if;
  if p_data_prevista is null then
    raise exception 'Data prevista mancante';
  end if;
  if p_righe is null or jsonb_typeof(p_righe) <> 'array' or jsonb_array_length(p_righe) = 0 then
    raise exception 'Il carico deve indicare almeno una materia';
  end if;

  select ordine_id, fornitore_id, righe
    into v_ordine, v_fornitore, v_snapshot
  from public.approvvigionamenti_versioni
  where id = p_versione_id
  for update;

  if v_ordine is null then
    raise exception 'Versione non disponibile';
  end if;

  v_operazione := public.approvvigionamento_acquisisci_operazione(
    p_chiave,
    'carico',
    jsonb_build_object('versioneId', p_versione_id, 'dataPrevista', p_data_prevista, 'righe', p_righe),
    p_versione_id
  );
  if v_operazione is null then
    select c.id, c.codice, c.foglio_id, g.codice
      into v_carico, v_codice, v_foglio, v_foglio_codice
    from public.approvvigionamenti_carichi c
    left join public.haccp_fogli_ingresso g on g.id = c.foglio_id
    where c.chiave = p_chiave
      and c.deleted_at is null;
    if v_carico is null or v_foglio is null then
      raise exception 'Operazione non disponibile';
    end if;
    return jsonb_build_object(
      'id', v_carico,
      'codice', v_codice,
      'foglioId', v_foglio,
      'foglioCodice', v_foglio_codice,
      'riusata', true
    );
  end if;

  for v_riga in select value from jsonb_array_elements(p_righe) loop
    v_materia := (v_riga->>'materiaPrimaId')::uuid;
    v_qty := (v_riga->>'quantita')::numeric;
    v_unita := v_riga->>'unitaMisura';
    if v_qty is null or v_qty <= 0 then
      raise exception 'Quantità prevista non valida';
    end if;
    select elemento
      into v_trovata
    from jsonb_array_elements(v_snapshot) elemento
    where elemento->>'materiaPrimaId' = v_materia::text
    limit 1;
    if v_trovata is null then
      raise exception 'La materia non è nello snapshot pubblicato';
    end if;
    if v_trovata->>'unitaMisura' is distinct from v_unita then
      raise exception 'L''unità non coincide con lo snapshot';
    end if;
    if exists (
      select 1
      from jsonb_array_elements(p_righe) altra
      where altra->>'materiaPrimaId' = v_materia::text
      having count(*) > 1
    ) then
      raise exception 'La stessa materia compare due volte nel carico';
    end if;
    v_viste := v_viste + 1;
  end loop;

  v_codice := 'CA-'
    || to_char(now() at time zone 'Europe/Rome', 'YY')
    || '-'
    || lpad(nextval('public.approvvigionamenti_carichi_seq')::text, 4, '0');

  insert into public.approvvigionamenti_carichi (
    codice, fornitore_id, ordine_id, versione_id, data_prevista, stato, chiave,
    created_by, updated_by
  )
  values (
    v_codice, v_fornitore, v_ordine, p_versione_id, p_data_prevista, 'aperto', p_chiave,
    public.app_effective_uid(), public.app_effective_uid()
  )
  returning id into v_carico;

  insert into public.approvvigionamenti_carichi_righe (
    carico_id, materia_prima_id, codice, nome, unita_misura, quantita_prevista,
    created_by, updated_by
  )
  select
    v_carico,
    (riga->>'materiaPrimaId')::uuid,
    snapshot.elemento->>'codice',
    snapshot.elemento->>'nome',
    snapshot.elemento->>'unitaMisura',
    (riga->>'quantita')::numeric,
    public.app_effective_uid(),
    public.app_effective_uid()
  from jsonb_array_elements(p_righe) riga
  join lateral (
    select elemento
    from jsonb_array_elements(v_snapshot) elemento
    where elemento->>'materiaPrimaId' = riga->>'materiaPrimaId'
    limit 1
  ) snapshot on true;

  v_foglio_codice := public.codice_foglio_ingresso();
  insert into public.haccp_fogli_ingresso (
    codice, fornitore_id, stato, opened_by, created_by, updated_by
  )
  values (
    v_foglio_codice,
    v_fornitore,
    'aperto',
    public.app_effective_uid(),
    public.app_effective_uid(),
    public.app_effective_uid()
  )
  returning id into v_foglio;

  update public.approvvigionamenti_carichi
  set foglio_id = v_foglio,
      updated_by = public.app_effective_uid()
  where id = v_carico
    and foglio_id is null;

  insert into public.approvvigionamenti_carichi_eventi (carico_id, tipo, payload, created_by)
  values (
    v_carico,
    'creato',
    jsonb_build_object('versioneId', p_versione_id, 'foglioId', v_foglio, 'righe', v_viste),
    public.app_effective_uid()
  );

  return jsonb_build_object(
    'id', v_carico,
    'codice', v_codice,
    'foglioId', v_foglio,
    'foglioCodice', v_foglio_codice,
    'riusata', false
  );
end;
$$;

create or replace function public.registra_arrivo_carico(
  p_chiave text,
  p_carico_id uuid,
  p_data_effettiva date,
  p_righe jsonb
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_operazione uuid;
  v_fornitore uuid;
  v_stato text;
  v_deleted timestamptz;
  v_riga jsonb;
  v_id uuid;
  v_prevista numeric;
  v_prima numeric;
  v_tipo text;
begin
  if not public.approvvigionamento_carico_autorizzato() then
    raise exception 'Non autorizzato a registrare l''arrivo';
  end if;
  if public.fornitore_collegato_id() is not null
     and not public.is_superadmin()
     and not public.has_area_access('produzione') then
    raise exception 'Non autorizzato a registrare l''arrivo';
  end if;
  if p_data_effettiva is null or p_righe is null or jsonb_array_length(p_righe) = 0 then
    raise exception 'Arrivo incompleto';
  end if;

  select fornitore_id, stato, deleted_at
    into v_fornitore, v_stato, v_deleted
  from public.approvvigionamenti_carichi
  where id = p_carico_id
  for update;

  if v_fornitore is null or v_deleted is not null then
    raise exception 'Carico non disponibile';
  end if;

  v_operazione := public.approvvigionamento_acquisisci_operazione(
    p_chiave,
    'arrivo',
    jsonb_build_object('caricoId', p_carico_id, 'dataEffettiva', p_data_effettiva, 'righe', p_righe),
    p_carico_id
  );
  if v_operazione is null then
    return jsonb_build_object('id', p_carico_id, 'riusata', true);
  end if;

  v_tipo := case when v_stato = 'arrivato' then 'correzione' else 'arrivo' end;

  for v_riga in select value from jsonb_array_elements(p_righe) loop
    select id, quantita_prevista, quantita_arrivata
      into v_id, v_prevista, v_prima
    from public.approvvigionamenti_carichi_righe
    where carico_id = p_carico_id
      and id = (v_riga->>'rigaId')::uuid
    for update;
    if v_id is null then
      raise exception 'Riga del carico non disponibile';
    end if;
    if (v_riga->>'quantita')::numeric < 0 then
      raise exception 'Quantità arrivata non valida';
    end if;
    update public.approvvigionamenti_carichi_righe
    set quantita_arrivata = (v_riga->>'quantita')::numeric,
        updated_by = public.app_effective_uid()
    where id = v_id;
    insert into public.approvvigionamenti_carichi_eventi (carico_id, tipo, payload, created_by)
    values (
      p_carico_id,
      v_tipo,
      jsonb_build_object(
        'rigaId', v_id,
        'prima', v_prima,
        'arrivata', (v_riga->>'quantita')::numeric,
        'prevista', v_prevista
      ),
      public.app_effective_uid()
    );
  end loop;

  update public.approvvigionamenti_carichi
  set stato = 'arrivato',
      data_effettiva = p_data_effettiva,
      updated_by = public.app_effective_uid()
  where id = p_carico_id;

  return jsonb_build_object('id', p_carico_id, 'riusata', false, 'tipo', v_tipo);
end;
$$;

alter table public.approvvigionamenti_carichi enable row level security;
alter table public.approvvigionamenti_carichi_righe enable row level security;
alter table public.approvvigionamenti_carichi_eventi enable row level security;

drop policy if exists "approvvigionamenti_carichi_select" on public.approvvigionamenti_carichi;
create policy "approvvigionamenti_carichi_select"
  on public.approvvigionamenti_carichi for select to authenticated
  using (
    public.approvvigionamento_autorizzato()
    or fornitore_id = public.fornitore_collegato_id()
  );

drop policy if exists "approvvigionamenti_carichi_righe_select" on public.approvvigionamenti_carichi_righe;
create policy "approvvigionamenti_carichi_righe_select"
  on public.approvvigionamenti_carichi_righe for select to authenticated
  using (
    exists (
      select 1
      from public.approvvigionamenti_carichi c
      where c.id = carico_id
        and c.deleted_at is null
        and (
          public.approvvigionamento_autorizzato()
          or c.fornitore_id = public.fornitore_collegato_id()
        )
    )
  );

drop policy if exists "approvvigionamenti_carichi_eventi_select" on public.approvvigionamenti_carichi_eventi;
create policy "approvvigionamenti_carichi_eventi_select"
  on public.approvvigionamenti_carichi_eventi for select to authenticated
  using (public.approvvigionamento_carico_autorizzato());

revoke all on table public.approvvigionamenti_carichi from public, anon, authenticated;
revoke all on table public.approvvigionamenti_carichi_righe from public, anon, authenticated;
revoke all on table public.approvvigionamenti_carichi_eventi from public, anon, authenticated;
grant select on public.approvvigionamenti_carichi to authenticated;
grant select on public.approvvigionamenti_carichi_righe to authenticated;
grant select on public.approvvigionamenti_carichi_eventi to authenticated;

revoke all on function public.approvvigionamento_carico_autorizzato() from public, anon;
revoke all on function public.crea_carico_approvvigionamento(text, uuid, date, jsonb) from public, anon;
revoke all on function public.registra_arrivo_carico(text, uuid, date, jsonb) from public, anon;
revoke all on function public.approvvigionamenti_carichi_proteggi() from public, anon, authenticated;
revoke all on function public.approvvigionamenti_carichi_evento_immutabile() from public, anon, authenticated;
grant execute on function public.approvvigionamento_carico_autorizzato() to authenticated;
grant execute on function public.crea_carico_approvvigionamento(text, uuid, date, jsonb) to authenticated;
grant execute on function public.registra_arrivo_carico(text, uuid, date, jsonb) to authenticated;
