-- Pubblicazione immutabile degli approvvigionamenti e presa visione.
-- Non invia mail, non apre fogli HACCP e non tocca gli ordini commerciali.
-- Le versioni già scritte non si aggiornano e non si cancellano.

alter table public.approvvigionamenti_ordini
  drop constraint if exists approvvigionamenti_ordini_stato_check;
alter table public.approvvigionamenti_ordini
  add constraint approvvigionamenti_ordini_stato_check
  check (stato in ('bozza', 'pubblicato', 'da_ripubblicare'));

alter table public.approvvigionamenti_piani
  drop constraint if exists approvvigionamenti_piani_stato_check;
alter table public.approvvigionamenti_piani
  add constraint approvvigionamenti_piani_stato_check
  check (stato in ('bozza', 'pubblicato', 'da_ripubblicare'));

alter table public.approvvigionamenti_operazioni
  drop constraint if exists approvvigionamenti_operazioni_tipo_check;
alter table public.approvvigionamenti_operazioni
  add constraint approvvigionamenti_operazioni_tipo_check
  check (tipo in (
    'crea', 'aggiorna', 'copia', 'settimana', 'piano', 'composizione', 'pubblica', 'visione'
  ));

create or replace function public.approvvigionamenti_solo_bozza()
returns trigger
language plpgsql
as $$
begin
  if new.presa_visione_at is not null or new.foglio_ingresso_id is not null then
    raise exception 'Presa visione e collegamento al carico non stanno su questa riga';
  end if;
  if new.stato not in ('bozza', 'pubblicato', 'da_ripubblicare') then
    raise exception 'Stato ordine non valido';
  end if;
  if tg_op = 'INSERT' then
    if new.stato <> 'bozza' or new.pubblicato_at is not null or new.versione_pubblicata is not null then
      raise exception 'Un ordine nuovo nasce in bozza';
    end if;
    return new;
  end if;
  if old.versione_pubblicata is not null
     and new.versione_pubblicata is not null
     and new.versione_pubblicata < old.versione_pubblicata then
    raise exception 'La versione pubblicata non si riduce';
  end if;
  if new.pubblicato_at is distinct from old.pubblicato_at
     or new.versione_pubblicata is distinct from old.versione_pubblicata
     or (new.stato = 'pubblicato' and old.stato is distinct from 'pubblicato')
  then
    if current_setting('approvvigionamento.pubblica', true) is distinct from '1' then
      raise exception 'La pubblicazione si registra solo con la funzione dedicata';
    end if;
  end if;
  return new;
end;
$$;

create or replace function public.approvvigionamenti_piani_solo_bozza()
returns trigger
language plpgsql
as $$
begin
  if new.presa_visione_at is not null then
    raise exception 'La presa visione del piano sta sulla versione, non sul piano';
  end if;
  if new.stato not in ('bozza', 'pubblicato', 'da_ripubblicare') then
    raise exception 'Stato piano non valido';
  end if;
  if tg_op = 'INSERT' then
    if new.stato <> 'bozza' or new.pubblicato_at is not null or new.versione_pubblicata is not null then
      raise exception 'Un piano nuovo nasce in bozza';
    end if;
    return new;
  end if;
  if old.versione_pubblicata is not null
     and new.versione_pubblicata is not null
     and new.versione_pubblicata < old.versione_pubblicata then
    raise exception 'La versione pubblicata non si riduce';
  end if;
  if new.pubblicato_at is distinct from old.pubblicato_at
     or new.versione_pubblicata is distinct from old.versione_pubblicata
     or (new.stato = 'pubblicato' and old.stato is distinct from 'pubblicato')
  then
    if current_setting('approvvigionamento.pubblica', true) is distinct from '1' then
      raise exception 'La pubblicazione si registra solo con la funzione dedicata';
    end if;
  end if;
  return new;
end;
$$;

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
    'crea', 'copia', 'settimana', 'piano', 'aggiorna', 'composizione', 'pubblica', 'visione'
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

create table if not exists public.approvvigionamenti_versioni (
  id uuid primary key default gen_random_uuid(),
  ordine_id uuid not null references public.approvvigionamenti_ordini (id),
  fornitore_id uuid not null references public.fornitori (id),
  numero integer not null check (numero > 0),
  codice text not null,
  data_consegna date not null,
  note text not null,
  righe jsonb not null,
  revisione_bozza integer not null check (revisione_bozza > 0),
  created_at timestamptz not null default now(),
  created_by uuid,
  unique (ordine_id, numero)
);

create unique index if not exists approvvigionamenti_versioni_revisione_uidx
  on public.approvvigionamenti_versioni (ordine_id, revisione_bozza);

comment on table public.approvvigionamenti_versioni is
  'Snapshot immutabile di un ordine. Non è accettazione commerciale, firma o garanzia di consegna.';

create table if not exists public.approvvigionamenti_piani_versioni (
  id uuid primary key default gen_random_uuid(),
  piano_id uuid not null references public.approvvigionamenti_piani (id),
  fornitore_id uuid not null references public.fornitori (id),
  numero integer not null check (numero > 0),
  codice text not null,
  tipologia text not null check (tipologia in ('settimanale', 'mensile')),
  periodo_inizio date not null,
  periodo_fine date not null,
  ordini jsonb not null,
  revisione_bozza integer not null check (revisione_bozza > 0),
  created_at timestamptz not null default now(),
  created_by uuid,
  unique (piano_id, numero)
);

create unique index if not exists approvvigionamenti_piani_versioni_revisione_uidx
  on public.approvvigionamenti_piani_versioni (piano_id, revisione_bozza);

comment on table public.approvvigionamenti_piani_versioni is
  'Snapshot immutabile del piano e delle versioni ordine incluse. Un piano resta di un solo fornitore.';

create table if not exists public.approvvigionamenti_notifiche (
  id uuid primary key default gen_random_uuid(),
  fornitore_id uuid not null references public.fornitori (id),
  versione_ordine_id uuid references public.approvvigionamenti_versioni (id),
  versione_piano_id uuid references public.approvvigionamenti_piani_versioni (id),
  notifica_stato text not null default 'non_inviata',
  notifica_lock uuid,
  notifica_lock_at timestamptz,
  notifica_tentativi integer not null default 0,
  notifica_at timestamptz,
  notifica_errore text,
  notifica_message_id text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  created_by uuid,
  updated_by uuid,
  deleted_at timestamptz,
  constraint approvvigionamenti_notifiche_bersaglio_check check (
    num_nonnulls(versione_ordine_id, versione_piano_id) = 1
  ),
  constraint approvvigionamenti_notifiche_stato_check check (
    notifica_stato in ('non_inviata', 'in_invio', 'inviata', 'fallita', 'incerta')
    and ((notifica_stato = 'inviata' and notifica_at is not null) or notifica_stato <> 'inviata')
    and (
      (notifica_stato = 'in_invio' and notifica_lock is not null and notifica_lock_at is not null)
      or notifica_stato <> 'in_invio'
    )
  )
);

create unique index if not exists approvvigionamenti_notifiche_ordine_uidx
  on public.approvvigionamenti_notifiche (versione_ordine_id);

create unique index if not exists approvvigionamenti_notifiche_piano_uidx
  on public.approvvigionamenti_notifiche (versione_piano_id);

create unique index if not exists approvvigionamenti_notifiche_lock_uidx
  on public.approvvigionamenti_notifiche (notifica_lock)
  where notifica_lock is not null;

comment on table public.approvvigionamenti_notifiche is
  'Una notifica logica per versione e fornitore. La pubblicazione resta valida se la mail fallisce.';

create table if not exists public.approvvigionamenti_prese_visione (
  id uuid primary key default gen_random_uuid(),
  fornitore_id uuid not null references public.fornitori (id),
  profile_id uuid not null references public.profiles (id),
  versione_ordine_id uuid references public.approvvigionamenti_versioni (id),
  versione_piano_id uuid references public.approvvigionamenti_piani_versioni (id),
  copertura jsonb,
  confermata_at timestamptz not null default now(),
  created_at timestamptz not null default now(),
  constraint approvvigionamenti_prese_bersaglio_check check (
    num_nonnulls(versione_ordine_id, versione_piano_id) = 1
  )
);

create unique index if not exists approvvigionamenti_prese_ordine_uidx
  on public.approvvigionamenti_prese_visione (profile_id, versione_ordine_id);

create unique index if not exists approvvigionamenti_prese_piano_uidx
  on public.approvvigionamenti_prese_visione (profile_id, versione_piano_id);

comment on table public.approvvigionamenti_prese_visione is
  'Presa visione della versione mostrata. Non è accettazione commerciale, firma qualificata o garanzia di consegna.';

create or replace function public.approvvigionamenti_versione_immutabile()
returns trigger
language plpgsql
as $$
begin
  raise exception 'Una versione pubblicata non si modifica';
end;
$$;

drop trigger if exists approvvigionamenti_versioni_immutabili on public.approvvigionamenti_versioni;
create trigger approvvigionamenti_versioni_immutabili
  before update or delete on public.approvvigionamenti_versioni
  for each row execute function public.approvvigionamenti_versione_immutabile();

drop trigger if exists approvvigionamenti_piani_versioni_immutabili on public.approvvigionamenti_piani_versioni;
create trigger approvvigionamenti_piani_versioni_immutabili
  before update or delete on public.approvvigionamenti_piani_versioni
  for each row execute function public.approvvigionamenti_versione_immutabile();

create or replace function public.approvvigionamenti_presa_immutabile()
returns trigger
language plpgsql
as $$
begin
  raise exception 'La presa visione registrata non si modifica';
end;
$$;

drop trigger if exists approvvigionamenti_prese_immutabili on public.approvvigionamenti_prese_visione;
create trigger approvvigionamenti_prese_immutabili
  before update or delete on public.approvvigionamenti_prese_visione
  for each row execute function public.approvvigionamenti_presa_immutabile();

drop trigger if exists approvvigionamenti_notifiche_updated_at on public.approvvigionamenti_notifiche;
create trigger approvvigionamenti_notifiche_updated_at
  before update on public.approvvigionamenti_notifiche
  for each row execute function public.set_updated_at();

drop trigger if exists approvvigionamenti_notifiche_lock on public.approvvigionamenti_notifiche;
create trigger approvvigionamenti_notifiche_lock
  before update on public.approvvigionamenti_notifiche
  for each row execute function public.notifica_distribuzione_proteggi();

create or replace function public.approvvigionamento_congela_ordine(
  p_ordine_id uuid,
  p_revisione integer,
  p_notifica boolean
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_fornitore uuid;
  v_revisione integer;
  v_codice text;
  v_data date;
  v_note text;
  v_deleted timestamptz;
  v_stato text;
  v_righe jsonb;
  v_versione uuid;
  v_numero integer;
  v_notifica uuid;
begin
  perform set_config('approvvigionamento.pubblica', '1', true);

  select fornitore_id, revisione, codice, data_consegna, note, deleted_at, stato
    into v_fornitore, v_revisione, v_codice, v_data, v_note, v_deleted, v_stato
  from public.approvvigionamenti_ordini
  where id = p_ordine_id
  for update;

  if v_fornitore is null or v_deleted is not null
     or v_stato not in ('bozza', 'pubblicato', 'da_ripubblicare') then
    raise exception 'Ordine non trovato';
  end if;
  if v_revisione is distinct from p_revisione then
    raise exception 'La bozza è stata modificata da un altro salvataggio. Ricarica e riprova.';
  end if;

  select id, numero
    into v_versione, v_numero
  from public.approvvigionamenti_versioni
  where ordine_id = p_ordine_id
    and revisione_bozza = p_revisione;

  if v_versione is null then
    select coalesce(jsonb_agg(jsonb_build_object(
      'materiaPrimaId', r.materia_prima_id,
      'codice', m.codice,
      'nome', m.nome,
      'quantita', r.quantita,
      'unitaMisura', r.unita_misura,
      'note', r.note
    ) order by r.sort_order), '[]'::jsonb)
      into v_righe
    from public.approvvigionamenti_righe r
    join public.materie_prime m on m.id = r.materia_prima_id
    where r.ordine_id = p_ordine_id
      and r.deleted_at is null;

    perform public.approvvigionamento_valida_righe(v_fornitore, v_righe);

    select coalesce(max(numero), 0) + 1
      into v_numero
    from public.approvvigionamenti_versioni
    where ordine_id = p_ordine_id;

    insert into public.approvvigionamenti_versioni (
      ordine_id, fornitore_id, numero, codice, data_consegna, note, righe,
      revisione_bozza, created_by
    )
    values (
      p_ordine_id, v_fornitore, v_numero, v_codice, v_data, v_note, v_righe,
      p_revisione, public.app_effective_uid()
    )
    returning id into v_versione;

    update public.approvvigionamenti_ordini
    set stato = 'pubblicato',
        versione_pubblicata = v_numero,
        pubblicato_at = now(),
        updated_by = public.app_effective_uid()
    where id = p_ordine_id
      and deleted_at is null
      and revisione = p_revisione
      and stato in ('bozza', 'pubblicato', 'da_ripubblicare');
  end if;

  if p_notifica then
    insert into public.approvvigionamenti_notifiche (
      fornitore_id, versione_ordine_id, notifica_stato, created_by, updated_by
    )
    values (v_fornitore, v_versione, 'non_inviata', public.app_effective_uid(), public.app_effective_uid())
    on conflict (versione_ordine_id) do nothing;
    select id into v_notifica
    from public.approvvigionamenti_notifiche
    where versione_ordine_id = v_versione;
  end if;

  return jsonb_build_object(
    'id', v_versione,
    'numero', v_numero,
    'notificaId', v_notifica,
    'riusata', v_numero is not null and v_righe is null
  );
end;
$$;

create or replace function public.pubblica_approvvigionamento_ordine(
  p_chiave text,
  p_ordine_id uuid,
  p_revisione integer
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_operazione uuid;
  v_esito jsonb;
begin
  if not public.approvvigionamento_autorizzato() then
    raise exception 'Non autorizzato a pubblicare gli approvvigionamenti';
  end if;
  v_operazione := public.approvvigionamento_acquisisci_operazione(
    p_chiave,
    'pubblica',
    jsonb_build_object('ordineId', p_ordine_id, 'revisioneAttesa', p_revisione),
    p_ordine_id
  );
  v_esito := public.approvvigionamento_congela_ordine(p_ordine_id, p_revisione, true);
  if v_operazione is null then
    return v_esito || jsonb_build_object('riusata', true);
  end if;
  return v_esito || jsonb_build_object('riusata', coalesce((v_esito->>'riusata')::boolean, false));
end;
$$;

create or replace function public.pubblica_approvvigionamento_piano(
  p_chiave text,
  p_piano_id uuid,
  p_revisione integer
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_operazione uuid;
  v_fornitore uuid;
  v_revisione integer;
  v_tipologia text;
  v_inizio date;
  v_fine date;
  v_codice text;
  v_deleted timestamptz;
  v_stato text;
  v_versione uuid;
  v_numero integer;
  v_ordini jsonb := '[]'::jsonb;
  v_ordine record;
  v_congelato jsonb;
  v_notifica uuid;
begin
  if not public.approvvigionamento_autorizzato() then
    raise exception 'Non autorizzato a pubblicare gli approvvigionamenti';
  end if;
  perform set_config('approvvigionamento.pubblica', '1', true);

  select fornitore_id, revisione, tipologia, periodo_inizio, periodo_fine, codice, deleted_at, stato
    into v_fornitore, v_revisione, v_tipologia, v_inizio, v_fine, v_codice, v_deleted, v_stato
  from public.approvvigionamenti_piani
  where id = p_piano_id
  for update;

  if v_fornitore is null or v_deleted is not null
     or v_stato not in ('bozza', 'pubblicato', 'da_ripubblicare') then
    raise exception 'Piano non trovato';
  end if;
  if v_revisione is distinct from p_revisione then
    raise exception 'Il piano è stato modificato da un altro salvataggio. Ricarica e riprova.';
  end if;

  v_operazione := public.approvvigionamento_acquisisci_operazione(
    p_chiave,
    'pubblica',
    jsonb_build_object('pianoId', p_piano_id, 'revisioneAttesa', p_revisione),
    p_piano_id
  );

  select id, numero
    into v_versione, v_numero
  from public.approvvigionamenti_piani_versioni
  where piano_id = p_piano_id
    and revisione_bozza = p_revisione;

  if v_versione is null then
    for v_ordine in
      select o.id, o.revisione, o.codice, o.data_consegna
      from public.approvvigionamenti_piani_ordini l
      join public.approvvigionamenti_ordini o on o.id = l.ordine_id
      where l.piano_id = p_piano_id
        and o.deleted_at is null
        and o.fornitore_id = v_fornitore
      order by o.id
    loop
      v_congelato := public.approvvigionamento_congela_ordine(v_ordine.id, v_ordine.revisione, false);
      v_ordini := v_ordini || jsonb_build_array(jsonb_build_object(
        'ordineId', v_ordine.id,
        'versioneId', v_congelato->>'id',
        'numero', (v_congelato->>'numero')::integer,
        'codice', v_ordine.codice,
        'dataConsegna', v_ordine.data_consegna
      ));
    end loop;
    if jsonb_array_length(v_ordini) = 0 then
      raise exception 'Il piano deve contenere almeno un ordine.';
    end if;

    select coalesce(max(numero), 0) + 1
      into v_numero
    from public.approvvigionamenti_piani_versioni
    where piano_id = p_piano_id;

    insert into public.approvvigionamenti_piani_versioni (
      piano_id, fornitore_id, numero, codice, tipologia, periodo_inizio, periodo_fine,
      ordini, revisione_bozza, created_by
    )
    values (
      p_piano_id, v_fornitore, v_numero, v_codice, v_tipologia, v_inizio, v_fine,
      v_ordini, p_revisione, public.app_effective_uid()
    )
    returning id into v_versione;

    update public.approvvigionamenti_piani
    set stato = 'pubblicato',
        versione_pubblicata = v_numero,
        pubblicato_at = now(),
        updated_by = public.app_effective_uid()
    where id = p_piano_id
      and revisione = p_revisione
      and deleted_at is null;
  end if;

  insert into public.approvvigionamenti_notifiche (
    fornitore_id, versione_piano_id, notifica_stato, created_by, updated_by
  )
  values (v_fornitore, v_versione, 'non_inviata', public.app_effective_uid(), public.app_effective_uid())
  on conflict (versione_piano_id) do nothing;
  select id into v_notifica
  from public.approvvigionamenti_notifiche
  where versione_piano_id = v_versione;

  return jsonb_build_object(
    'id', v_versione,
    'numero', v_numero,
    'notificaId', v_notifica,
    'riusata', v_operazione is null,
    'ordini', coalesce((
      select ordini from public.approvvigionamenti_piani_versioni where id = v_versione
    ), '[]'::jsonb)
  );
end;
$$;

create or replace function public.conferma_presa_visione_approvvigionamento(
  p_chiave text,
  p_ambito text,
  p_versione_id uuid
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_fornitore uuid;
  v_collegato uuid;
  v_profilo uuid;
  v_copertura jsonb;
  v_id uuid;
  v_at timestamptz;
  v_operazione uuid;
  v_nuova boolean := false;
begin
  if p_ambito not in ('ordine', 'piano') then
    raise exception 'Questa versione non è disponibile';
  end if;
  v_collegato := public.fornitore_collegato_id();
  v_profilo := public.app_effective_uid();
  if v_collegato is null or v_profilo is null then
    raise exception 'Questa versione non è disponibile';
  end if;

  if p_ambito = 'ordine' then
    select fornitore_id into v_fornitore
    from public.approvvigionamenti_versioni
    where id = p_versione_id;
  else
    select fornitore_id, ordini
      into v_fornitore, v_copertura
    from public.approvvigionamenti_piani_versioni
    where id = p_versione_id;
  end if;
  if v_fornitore is null or v_fornitore is distinct from v_collegato then
    raise exception 'Questa versione non è disponibile';
  end if;

  v_operazione := public.approvvigionamento_acquisisci_operazione(
    p_chiave,
    'visione',
    jsonb_build_object('ambito', p_ambito, 'versioneId', p_versione_id),
    p_versione_id
  );

  if p_ambito = 'ordine' then
    insert into public.approvvigionamenti_prese_visione (
      fornitore_id, profile_id, versione_ordine_id
    )
    values (v_fornitore, v_profilo, p_versione_id)
    on conflict (profile_id, versione_ordine_id) do nothing
    returning id, confermata_at into v_id, v_at;
    v_nuova := v_id is not null;
    if v_id is null then
      select id, confermata_at into v_id, v_at
      from public.approvvigionamenti_prese_visione
      where profile_id = v_profilo
        and versione_ordine_id = p_versione_id;
    end if;
  else
    insert into public.approvvigionamenti_prese_visione (
      fornitore_id, profile_id, versione_piano_id, copertura
    )
    values (v_fornitore, v_profilo, p_versione_id, v_copertura)
    on conflict (profile_id, versione_piano_id) do nothing
    returning id, confermata_at into v_id, v_at;
    v_nuova := v_id is not null;
    if v_id is null then
      select id, confermata_at into v_id, v_at
      from public.approvvigionamenti_prese_visione
      where profile_id = v_profilo
        and versione_piano_id = p_versione_id;
    end if;
  end if;

  return jsonb_build_object(
    'id', v_id,
    'confermataAt', v_at,
    'riusata', v_operazione is null or not v_nuova
  );
end;
$$;

create or replace function public.aggiorna_approvvigionamento(
  p_chiave text,
  p_ordine_id uuid,
  p_ordine jsonb,
  p_revisione integer
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_operazione uuid;
  v_fornitore uuid;
  v_aggiornato uuid;
  v_revisione integer;
begin
  if not public.approvvigionamento_autorizzato() then
    raise exception 'Non autorizzato a registrare gli approvvigionamenti';
  end if;
  if p_revisione is null or p_revisione <= 0 then
    raise exception 'Revisione della bozza mancante';
  end if;

  perform 1
  from public.approvvigionamenti_ordini
  where id = p_ordine_id
  for update;

  v_operazione := public.approvvigionamento_acquisisci_operazione(
    p_chiave,
    'aggiorna',
    p_ordine || jsonb_build_object('revisioneAttesa', p_revisione),
    p_ordine_id
  );
  if v_operazione is null then
    select revisione into v_revisione
    from public.approvvigionamenti_ordini
    where id = p_ordine_id;
    return jsonb_build_object('riusata', true, 'id', p_ordine_id, 'revisione', v_revisione);
  end if;

  v_fornitore := (p_ordine->>'fornitoreId')::uuid;
  perform public.approvvigionamento_valida_righe(v_fornitore, p_ordine->'righe');
  if exists (
    select 1
    from public.approvvigionamenti_piani_ordini po
    join public.approvvigionamenti_piani p on p.id = po.piano_id
    where po.ordine_id = p_ordine_id
      and p.deleted_at is null
      and (
        p.fornitore_id <> v_fornitore
        or (p_ordine->>'dataConsegna')::date < p.periodo_inizio
        or (p_ordine->>'dataConsegna')::date > p.periodo_fine
      )
  ) then
    raise exception 'L''ordine resta nel periodo e nel fornitore del suo piano.';
  end if;

  update public.approvvigionamenti_ordini
  set fornitore_id = v_fornitore,
      data_consegna = (p_ordine->>'dataConsegna')::date,
      note = left(coalesce(p_ordine->>'note', ''), 2000),
      updated_by = public.app_effective_uid(),
      revisione = revisione + 1,
      stato = case
        when versione_pubblicata is not null then 'da_ripubblicare'
        else stato
      end
  where id = p_ordine_id
    and deleted_at is null
    and stato in ('bozza', 'pubblicato', 'da_ripubblicare')
    and revisione = p_revisione
    and presa_visione_at is null
    and foglio_ingresso_id is null
  returning id, revisione into v_aggiornato, v_revisione;

  if v_aggiornato is null then
    if exists (
      select 1 from public.approvvigionamenti_ordini
      where id = p_ordine_id
        and deleted_at is null
        and stato in ('bozza', 'pubblicato', 'da_ripubblicare')
    ) then
      raise exception 'La bozza è stata modificata da un altro salvataggio. Ricarica e riprova.';
    end if;
    raise exception 'Ordine non trovato';
  end if;

  update public.approvvigionamenti_piani p
  set stato = 'da_ripubblicare',
      updated_by = public.app_effective_uid()
  from public.approvvigionamenti_piani_ordini po
  where po.piano_id = p.id
    and po.ordine_id = p_ordine_id
    and p.deleted_at is null
    and p.versione_pubblicata is not null;

  update public.approvvigionamenti_righe
  set deleted_at = now(),
      deleted_by = public.app_effective_uid()
  where ordine_id = p_ordine_id
    and deleted_at is null;

  insert into public.approvvigionamenti_righe (
    ordine_id, materia_prima_id, quantita, unita_misura, note, sort_order,
    created_by, updated_by
  )
  select
    p_ordine_id,
    (riga->>'materiaPrimaId')::uuid,
    (riga->>'quantita')::numeric,
    riga->>'unitaMisura',
    left(coalesce(riga->>'note', ''), 500),
    ordinality::integer - 1,
    public.app_effective_uid(),
    public.app_effective_uid()
  from jsonb_array_elements(p_ordine->'righe') with ordinality as t(riga, ordinality);

  insert into public.approvvigionamenti_operazioni_ordini (operazione_id, ordine_id)
  values (v_operazione, p_ordine_id);

  return jsonb_build_object('riusata', false, 'id', p_ordine_id, 'revisione', v_revisione);
end;
$$;

create or replace function public.aggiorna_composizione_piano(
  p_chiave text,
  p_piano_id uuid,
  p_revisione integer,
  p_ordini uuid[]
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_operazione uuid;
  v_fornitore uuid;
  v_inizio date;
  v_fine date;
  v_stato text;
  v_revisione integer;
  v_deleted timestamptz;
  v_attesi integer;
  v_trovati integer;
  v_nuova integer;
  v_impronta jsonb;
  v_pubblicata integer;
begin
  if not public.approvvigionamento_autorizzato() then
    raise exception 'Non autorizzato a registrare gli approvvigionamenti';
  end if;
  if p_revisione is null or p_revisione <= 0 then
    raise exception 'Revisione del piano mancante';
  end if;
  if p_ordini is null or cardinality(p_ordini) = 0 then
    raise exception 'Il piano deve contenere almeno un ordine.';
  end if;

  select coalesce(jsonb_agg(x order by x), '[]'::jsonb)
    into v_impronta
  from (select distinct unnest(p_ordini) as x) distinti;
  v_impronta := jsonb_build_object(
    'pianoId', p_piano_id,
    'revisioneAttesa', p_revisione,
    'ordini', v_impronta
  );

  select fornitore_id, periodo_inizio, periodo_fine, stato, revisione, deleted_at, versione_pubblicata
    into v_fornitore, v_inizio, v_fine, v_stato, v_revisione, v_deleted, v_pubblicata
  from public.approvvigionamenti_piani
  where id = p_piano_id
  for update;

  v_operazione := public.approvvigionamento_acquisisci_operazione(
    p_chiave, 'composizione', v_impronta, p_piano_id
  );
  if v_operazione is null then
    select revisione into v_nuova
    from public.approvvigionamenti_piani
    where id = p_piano_id;
    return jsonb_build_object('riusata', true, 'id', p_piano_id, 'revisione', v_nuova);
  end if;

  if v_fornitore is null or v_deleted is not null
     or v_stato not in ('bozza', 'pubblicato', 'da_ripubblicare') then
    raise exception 'Piano non trovato';
  end if;
  if v_revisione is distinct from p_revisione then
    raise exception 'Il piano è stato modificato da un altro salvataggio. Ricarica e riprova.';
  end if;

  select count(distinct x) into v_attesi from unnest(p_ordini) x;
  select count(*) into v_trovati
  from public.approvvigionamenti_ordini o
  where o.id = any(p_ordini)
    and o.deleted_at is null
    and o.stato in ('bozza', 'pubblicato', 'da_ripubblicare')
    and o.fornitore_id = v_fornitore
    and o.data_consegna between v_inizio and v_fine
    and o.foglio_ingresso_id is null;
  if v_trovati <> v_attesi then
    raise exception 'La composizione contiene un ordine non compatibile con il piano.';
  end if;
  if exists (
    select 1
    from public.approvvigionamenti_piani_ordini l
    where l.ordine_id = any(p_ordini)
      and l.piano_id <> p_piano_id
  ) then
    raise exception 'Un ordine appartiene già a un altro piano.';
  end if;

  delete from public.approvvigionamenti_piani_ordini
  where piano_id = p_piano_id
    and not (ordine_id = any(p_ordini));

  insert into public.approvvigionamenti_piani_ordini (piano_id, ordine_id, created_by)
  select p_piano_id, o.id, public.app_effective_uid()
  from public.approvvigionamenti_ordini o
  where o.id = any(p_ordini)
    and not exists (
      select 1
      from public.approvvigionamenti_piani_ordini l
      where l.piano_id = p_piano_id
        and l.ordine_id = o.id
    );

  update public.approvvigionamenti_piani
  set revisione = revisione + 1,
      updated_by = public.app_effective_uid(),
      stato = case
        when versione_pubblicata is not null then 'da_ripubblicare'
        else stato
      end
  where id = p_piano_id
    and deleted_at is null
    and stato in ('bozza', 'pubblicato', 'da_ripubblicare')
    and revisione = p_revisione
    and presa_visione_at is null
  returning revisione into v_nuova;

  if v_nuova is null then
    raise exception 'Il piano è stato modificato da un altro salvataggio. Ricarica e riprova.';
  end if;

  return jsonb_build_object('riusata', false, 'id', p_piano_id, 'revisione', v_nuova);
end;
$$;

create or replace function public.notifica_distribuzione_tabella(p_canale text)
returns text
language plpgsql
immutable
as $$
begin
  if p_canale = 'haccp' then
    return 'haccp_linee_guida_distribuzioni';
  end if;
  if p_canale = 'testo' then
    return 'fornitori_testi_distribuzioni';
  end if;
  if p_canale = 'approvvigionamento' then
    return 'approvvigionamenti_notifiche';
  end if;
  raise exception 'Canale notifica non valido';
end;
$$;

create or replace function public.notifica_distribuzione_autorizzata(p_canale text)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select case
    when p_canale in ('haccp', 'approvvigionamento') then
      public.is_superadmin()
      or public.has_area_access('produzione')
      or public.has_area_access('amministrazione')
    when p_canale = 'testo' then
      public.is_superadmin()
      or public.has_area_access('amministrazione')
    else false
  end;
$$;

alter table public.approvvigionamenti_versioni enable row level security;
alter table public.approvvigionamenti_piani_versioni enable row level security;
alter table public.approvvigionamenti_notifiche enable row level security;
alter table public.approvvigionamenti_prese_visione enable row level security;

drop policy if exists "approvvigionamenti_versioni_select" on public.approvvigionamenti_versioni;
create policy "approvvigionamenti_versioni_select"
  on public.approvvigionamenti_versioni for select to authenticated
  using (
    public.approvvigionamento_autorizzato()
    or fornitore_id = public.fornitore_collegato_id()
  );

drop policy if exists "approvvigionamenti_piani_versioni_select" on public.approvvigionamenti_piani_versioni;
create policy "approvvigionamenti_piani_versioni_select"
  on public.approvvigionamenti_piani_versioni for select to authenticated
  using (
    public.approvvigionamento_autorizzato()
    or fornitore_id = public.fornitore_collegato_id()
  );

drop policy if exists "approvvigionamenti_notifiche_select" on public.approvvigionamenti_notifiche;
create policy "approvvigionamenti_notifiche_select"
  on public.approvvigionamenti_notifiche for select to authenticated
  using (public.approvvigionamento_autorizzato());

drop policy if exists "approvvigionamenti_prese_select" on public.approvvigionamenti_prese_visione;
create policy "approvvigionamenti_prese_select"
  on public.approvvigionamenti_prese_visione for select to authenticated
  using (
    public.approvvigionamento_autorizzato()
    or fornitore_id = public.fornitore_collegato_id()
  );

revoke all on table public.approvvigionamenti_versioni from public, anon, authenticated;
revoke all on table public.approvvigionamenti_piani_versioni from public, anon, authenticated;
revoke all on table public.approvvigionamenti_notifiche from public, anon, authenticated;
revoke all on table public.approvvigionamenti_prese_visione from public, anon, authenticated;
grant select on public.approvvigionamenti_versioni to authenticated;
grant select on public.approvvigionamenti_piani_versioni to authenticated;
grant select on public.approvvigionamenti_notifiche to authenticated;
grant select on public.approvvigionamenti_prese_visione to authenticated;

revoke all on function public.approvvigionamento_congela_ordine(uuid, integer, boolean) from public, anon, authenticated;
revoke all on function public.approvvigionamenti_versione_immutabile() from public, anon, authenticated;
revoke all on function public.approvvigionamenti_presa_immutabile() from public, anon, authenticated;
revoke all on function public.pubblica_approvvigionamento_ordine(text, uuid, integer) from public, anon;
revoke all on function public.pubblica_approvvigionamento_piano(text, uuid, integer) from public, anon;
revoke all on function public.conferma_presa_visione_approvvigionamento(text, text, uuid) from public, anon;
grant execute on function public.pubblica_approvvigionamento_ordine(text, uuid, integer) to authenticated;
grant execute on function public.pubblica_approvvigionamento_piano(text, uuid, integer) to authenticated;
grant execute on function public.conferma_presa_visione_approvvigionamento(text, text, uuid) to authenticated;
revoke all on function public.approvvigionamento_acquisisci_operazione(text, text, jsonb, uuid) from public, anon, authenticated;
