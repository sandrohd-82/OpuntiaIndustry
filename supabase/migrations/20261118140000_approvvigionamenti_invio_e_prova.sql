-- Conferma con email e dati di prova persistenti.
-- La coda approvvigionamenti_invii è distinta dalle notifiche di pubblicazione.
-- I codici TEST- non usano approvvigionamenti_codice_seq né approvvigionamenti_piani_codice_seq.
-- La funzione a tre argomenti resta per le chiamate già in uso.

alter table public.approvvigionamenti_ordini
  add column if not exists prova boolean not null default false;

alter table public.approvvigionamenti_piani
  add column if not exists prova boolean not null default false;

comment on column public.approvvigionamenti_ordini.prova is
  'Ordine di prova. Non usa il progressivo aziendale e non si pubblica.';

comment on column public.approvvigionamenti_piani.prova is
  'Pianificazione di prova. Resta isolata dagli ordini aziendali.';

alter table public.approvvigionamenti_ordini
  drop constraint if exists approvvigionamenti_ordini_prova_codice_check;
alter table public.approvvigionamenti_ordini
  add constraint approvvigionamenti_ordini_prova_codice_check
  check (
    (prova and codice like 'TEST-AP-%')
    or (not prova and codice not like 'TEST-%')
  );

alter table public.approvvigionamenti_piani
  drop constraint if exists approvvigionamenti_piani_prova_codice_check;
alter table public.approvvigionamenti_piani
  add constraint approvvigionamenti_piani_prova_codice_check
  check (
    (prova and codice like 'TEST-PP-%')
    or (not prova and codice not like 'TEST-%')
  );

create index if not exists approvvigionamenti_ordini_prova_idx
  on public.approvvigionamenti_ordini (prova, data_consegna)
  where deleted_at is null;

create index if not exists approvvigionamenti_piani_prova_idx
  on public.approvvigionamenti_piani (prova, periodo_inizio)
  where deleted_at is null;

create sequence if not exists public.approvvigionamenti_prova_ordine_seq;
create sequence if not exists public.approvvigionamenti_prova_piano_seq;
revoke all on sequence public.approvvigionamenti_prova_ordine_seq from public, anon, authenticated;
revoke all on sequence public.approvvigionamenti_prova_piano_seq from public, anon, authenticated;

create or replace function public.registra_approvvigionamenti(
  p_chiave text,
  p_tipo text,
  p_ordini jsonb,
  p_prova boolean default false
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
    p_chiave,
    p_tipo,
    jsonb_build_object('ordini', p_ordini, '_prova', coalesce(p_prova, false)),
    null
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
    if coalesce(p_prova, false) then
      v_codice := 'TEST-AP-' || to_char(current_date, 'YY') || '-'
        || lpad(nextval('public.approvvigionamenti_prova_ordine_seq')::text, 4, '0');
    else
      v_codice := 'AP-' || to_char(current_date, 'YY') || '-'
        || lpad(nextval('public.approvvigionamenti_codice_seq')::text, 4, '0');
    end if;
    insert into public.approvvigionamenti_ordini (
      codice, fornitore_id, data_consegna, note, stato, origine_ordine_id,
      revisione, prova, created_by, updated_by
    )
    values (
      v_codice,
      v_fornitore,
      (v_ordine->>'dataConsegna')::date,
      left(coalesce(v_ordine->>'note', ''), 2000),
      'bozza',
      nullif(v_ordine->>'origineOrdineId', '')::uuid,
      1,
      coalesce(p_prova, false),
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
      if coalesce(p_prova, false) then
        v_codice := 'TEST-PP-' || to_char(current_date, 'YY') || '-'
          || lpad(nextval('public.approvvigionamenti_prova_piano_seq')::text, 4, '0');
      else
        v_codice := 'PP-' || to_char(current_date, 'YY') || '-'
          || lpad(nextval('public.approvvigionamenti_piani_codice_seq')::text, 4, '0');
      end if;
      insert into public.approvvigionamenti_piani (
        codice, fornitore_id, periodo_inizio, periodo_fine, tipologia, cadenza_giorni,
        tipo_quantita, stato, prova, created_by, updated_by
      )
      values (
        v_codice, v_fornitore, v_inizio, v_fine, v_tipologia, v_cadenza,
        v_tipo_quantita, 'bozza', coalesce(p_prova, false),
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
  elsif coalesce(p_prova, false) then
    v_piani := '[]'::jsonb;
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

comment on function public.registra_approvvigionamenti(text, text, jsonb, boolean) is
  'Registra bozze reali oppure di prova. La prova non consuma i progressivi AP- e PP-.';

revoke all on function public.registra_approvvigionamenti(text, text, jsonb, boolean) from public, anon;
grant execute on function public.registra_approvvigionamenti(text, text, jsonb, boolean) to authenticated;

create or replace function public.approvvigionamento_aggiungi_consegna_piano(
  p_chiave text,
  p_piano_id uuid,
  p_revisione integer,
  p_data date,
  p_note text,
  p_righe jsonb
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_fornitore uuid;
  v_inizio date;
  v_fine date;
  v_revisione integer;
  v_stato text;
  v_deleted timestamptz;
  v_prova boolean;
  v_operazione uuid;
  v_ordine uuid;
  v_codice text;
  v_nuova integer;
  v_riga jsonb;
  v_tipo text;
begin
  if not public.approvvigionamento_autorizzato() then
    raise exception 'Non autorizzato a registrare gli approvvigionamenti';
  end if;
  if p_data is null then
    raise exception 'Data non valida';
  end if;
  if jsonb_typeof(p_righe) <> 'array' or jsonb_array_length(p_righe) = 0 then
    raise exception 'Serve almeno una materia prima.';
  end if;
  for v_riga in select value from jsonb_array_elements(p_righe)
  loop
    v_tipo := coalesce(nullif(v_riga->>'tipoQuantita', ''), '');
    if v_tipo not in ('precisa', 'stimata') then
      raise exception 'Indica se la quantità è precisa o stimata.';
    end if;
  end loop;

  select fornitore_id, periodo_inizio, periodo_fine, revisione, stato, deleted_at, prova
    into v_fornitore, v_inizio, v_fine, v_revisione, v_stato, v_deleted, v_prova
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

  perform public.approvvigionamento_valida_righe(v_fornitore, p_righe);

  v_operazione := public.approvvigionamento_acquisisci_operazione(
    p_chiave,
    'aggiungi',
    jsonb_build_object(
      'pianoId', p_piano_id,
      'data', p_data,
      'revisioneAttesa', p_revisione,
      'righe', p_righe,
      '_prova', coalesce(v_prova, false)
    ),
    p_piano_id
  );
  if v_operazione is null then
    select l.ordine_id, o.codice, p.revisione, p.periodo_inizio, p.periodo_fine
      into v_ordine, v_codice, v_revisione, v_inizio, v_fine
    from public.approvvigionamenti_operazioni_ordini l
    join public.approvvigionamenti_ordini o on o.id = l.ordine_id
    join public.approvvigionamenti_piani p on p.id = p_piano_id
    where l.operazione_id = (
      select id from public.approvvigionamenti_operazioni where chiave = p_chiave
    );
    return jsonb_build_object(
      'riusata', true,
      'ordineId', v_ordine,
      'codice', v_codice,
      'revisione', v_revisione,
      'periodoInizio', v_inizio,
      'periodoFine', v_fine
    );
  end if;

  if coalesce(v_prova, false) then
    v_codice := 'TEST-AP-' || to_char(current_date, 'YY') || '-'
      || lpad(nextval('public.approvvigionamenti_prova_ordine_seq')::text, 4, '0');
  else
    v_codice := 'AP-' || to_char(current_date, 'YY') || '-'
      || lpad(nextval('public.approvvigionamenti_codice_seq')::text, 4, '0');
  end if;

  insert into public.approvvigionamenti_ordini (
    codice, fornitore_id, data_consegna, note, stato, revisione, prova, created_by, updated_by
  )
  values (
    v_codice,
    v_fornitore,
    p_data,
    left(coalesce(p_note, ''), 2000),
    'bozza',
    1,
    coalesce(v_prova, false),
    public.app_effective_uid(),
    public.app_effective_uid()
  )
  returning id into v_ordine;

  insert into public.approvvigionamenti_righe (
    ordine_id, materia_prima_id, quantita, unita_misura, tipo_quantita, note, sort_order,
    created_by, updated_by
  )
  select
    v_ordine,
    (riga->>'materiaPrimaId')::uuid,
    (riga->>'quantita')::numeric,
    riga->>'unitaMisura',
    riga->>'tipoQuantita',
    left(coalesce(riga->>'note', ''), 500),
    ordinality::integer - 1,
    public.app_effective_uid(),
    public.app_effective_uid()
  from jsonb_array_elements(p_righe) with ordinality as t(riga, ordinality);

  insert into public.approvvigionamenti_operazioni_ordini (operazione_id, ordine_id)
  values (v_operazione, v_ordine);

  insert into public.approvvigionamenti_piani_ordini (piano_id, ordine_id, created_by)
  values (p_piano_id, v_ordine, public.app_effective_uid());

  update public.approvvigionamenti_piani
  set periodo_inizio = least(periodo_inizio, p_data),
      periodo_fine = greatest(periodo_fine, p_data),
      revisione = revisione + 1,
      updated_by = public.app_effective_uid(),
      stato = case
        when versione_pubblicata is not null and coalesce(prova, false) = false then 'da_ripubblicare'
        else stato
      end
  where id = p_piano_id
    and revisione = p_revisione
  returning revisione, periodo_inizio, periodo_fine
    into v_nuova, v_inizio, v_fine;

  if v_nuova is null then
    raise exception 'Il piano è stato modificato da un altro salvataggio. Ricarica e riprova.';
  end if;

  return jsonb_build_object(
    'riusata', false,
    'ordineId', v_ordine,
    'codice', v_codice,
    'revisione', v_nuova,
    'periodoInizio', v_inizio,
    'periodoFine', v_fine
  );
end;
$$;

create or replace function public.approvvigionamento_blocca_prova_ufficiale()
returns trigger
language plpgsql
as $$
declare
  v_prova boolean;
begin
  if tg_table_name = 'approvvigionamenti_versioni' then
    select prova into v_prova from public.approvvigionamenti_ordini where id = new.ordine_id;
  elsif tg_table_name = 'approvvigionamenti_piani_versioni' then
    select prova into v_prova from public.approvvigionamenti_piani where id = new.piano_id;
  elsif tg_table_name = 'approvvigionamenti_carichi' then
    select prova into v_prova from public.approvvigionamenti_ordini where id = new.ordine_id;
  end if;
  if coalesce(v_prova, false) then
    raise exception 'I dati di prova non generano pubblicazioni, carichi o movimenti di magazzino.';
  end if;
  return new;
end;
$$;

drop trigger if exists approvvigionamenti_versioni_blocca_prova on public.approvvigionamenti_versioni;
create trigger approvvigionamenti_versioni_blocca_prova
  before insert on public.approvvigionamenti_versioni
  for each row execute function public.approvvigionamento_blocca_prova_ufficiale();

drop trigger if exists approvvigionamenti_piani_versioni_blocca_prova on public.approvvigionamenti_piani_versioni;
create trigger approvvigionamenti_piani_versioni_blocca_prova
  before insert on public.approvvigionamenti_piani_versioni
  for each row execute function public.approvvigionamento_blocca_prova_ufficiale();

drop trigger if exists approvvigionamenti_carichi_blocca_prova on public.approvvigionamenti_carichi;
create trigger approvvigionamenti_carichi_blocca_prova
  before insert on public.approvvigionamenti_carichi
  for each row execute function public.approvvigionamento_blocca_prova_ufficiale();

create or replace function public.approvvigionamento_legame_prova_coerente()
returns trigger
language plpgsql
as $$
declare
  v_ordine boolean;
  v_piano boolean;
begin
  select prova into v_ordine from public.approvvigionamenti_ordini where id = new.ordine_id;
  select prova into v_piano from public.approvvigionamenti_piani where id = new.piano_id;
  if coalesce(v_ordine, false) is distinct from coalesce(v_piano, false) then
    raise exception 'Un piano di prova non si collega a un ordine aziendale, e il contrario.';
  end if;
  return new;
end;
$$;

drop trigger if exists approvvigionamenti_piani_ordini_prova_coerente on public.approvvigionamenti_piani_ordini;
create trigger approvvigionamenti_piani_ordini_prova_coerente
  before insert or update on public.approvvigionamenti_piani_ordini
  for each row execute function public.approvvigionamento_legame_prova_coerente();

create table if not exists public.approvvigionamenti_invii (
  id uuid primary key default gen_random_uuid(),
  prova boolean not null default false,
  ordine_id uuid references public.approvvigionamenti_ordini (id),
  piano_id uuid references public.approvvigionamenti_piani (id),
  revisione integer not null check (revisione > 0),
  chiave text not null unique,
  destinatario text not null,
  oggetto text not null,
  testo text not null,
  allega_pdf boolean not null default false,
  allega_xlsx boolean not null default false,
  snapshot jsonb not null,
  notifica_stato text not null default 'non_inviata',
  notifica_lock uuid,
  notifica_lock_at timestamptz,
  notifica_tentativi integer not null default 0,
  notifica_at timestamptz,
  notifica_errore text,
  notifica_message_id text,
  annullato_at timestamptz,
  operatore_id uuid not null,
  impersonato_da uuid,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  created_by uuid,
  updated_by uuid,
  deleted_at timestamptz,
  deleted_by uuid,
  constraint approvvigionamenti_invii_bersaglio_check check (
    num_nonnulls(ordine_id, piano_id) = 1
  ),
  constraint approvvigionamenti_invii_stato_check check (
    notifica_stato in ('non_inviata', 'in_invio', 'inviata', 'fallita', 'incerta')
    and ((notifica_stato = 'inviata' and notifica_at is not null) or notifica_stato <> 'inviata')
    and (
      (notifica_stato = 'in_invio' and notifica_lock is not null and notifica_lock_at is not null)
      or notifica_stato <> 'in_invio'
    )
  )
);

comment on table public.approvvigionamenti_invii is
  'Richiesta di email dell''operatore, dopo il salvataggio. Non è la notifica di pubblicazione.';

drop trigger if exists approvvigionamenti_invii_updated_at on public.approvvigionamenti_invii;
create trigger approvvigionamenti_invii_updated_at
  before update on public.approvvigionamenti_invii
  for each row execute function public.set_updated_at();

alter table public.approvvigionamenti_invii enable row level security;
revoke all on table public.approvvigionamenti_invii from public, anon, authenticated;

create or replace function public.prenota_invio_approvvigionamento(
  p_chiave text,
  p_ordine_id uuid,
  p_piano_id uuid,
  p_revisione integer,
  p_destinatario text,
  p_oggetto text,
  p_testo text,
  p_pdf boolean,
  p_xlsx boolean,
  p_snapshot jsonb
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_prova boolean;
  v_codice text;
  v_revisione integer;
  v_fornitore uuid;
  v_fornitore_nome text;
  v_ids uuid[];
  v_note text;
  v_inizio date;
  v_fine date;
  v_materie integer;
  v_materia text;
  v_diverso boolean;
  v_id uuid;
  v_stato text;
  v_snapshot jsonb;
  v_destinatario text;
  v_operatore uuid;
  v_impersonato uuid;
  v_richiesto_dest text;
  v_richiesto_oggetto text;
  v_richiesto_testo text;
  v_richiesto_pdf boolean;
  v_richiesto_xlsx boolean;
  v_richiesto_snapshot jsonb;
  v_richiesto_ordine uuid;
  v_richiesto_piano uuid;
  v_riga_ordine uuid;
  v_riga_piano uuid;
  v_riga_oggetto text;
  v_riga_testo text;
  v_riga_pdf boolean;
  v_riga_xlsx boolean;
begin
  if not public.approvvigionamento_autorizzato() then
    raise exception 'Non autorizzato a registrare l''invio';
  end if;
  if p_chiave is null or length(btrim(p_chiave)) < 8 then
    raise exception 'Chiave invio non valida';
  end if;
  if num_nonnulls(p_ordine_id, p_piano_id) <> 1 then
    raise exception 'L''invio riguarda un ordine oppure una pianificazione.';
  end if;
  v_destinatario := lower(btrim(coalesce(p_destinatario, '')));
  if v_destinatario !~ '^[^[:space:],;@]+@[^[:space:],;@]+\.[^[:space:],;@]+$' then
    raise exception 'Indirizzo email non valido.';
  end if;
  if char_length(btrim(coalesce(p_oggetto, ''))) < 3 or char_length(btrim(p_oggetto)) > 200 then
    raise exception 'Oggetto non valido.';
  end if;
  if char_length(btrim(coalesce(p_testo, ''))) < 3 or char_length(p_testo) > 4500 then
    raise exception 'Testo non valido.';
  end if;

  if p_piano_id is not null then
    select prova, codice, revisione, fornitore_id, periodo_inizio, periodo_fine
      into v_prova, v_codice, v_revisione, v_fornitore, v_inizio, v_fine
    from public.approvvigionamenti_piani
    where id = p_piano_id and deleted_at is null;
    if v_codice is null then
      raise exception 'Pianificazione non trovata.';
    end if;
    select coalesce(array_agg(o.id), array[]::uuid[])
      into v_ids
    from public.approvvigionamenti_piani_ordini po
    join public.approvvigionamenti_ordini o on o.id = po.ordine_id
    where po.piano_id = p_piano_id and o.deleted_at is null;
  else
    select prova, codice, revisione, fornitore_id, data_consegna, data_consegna
      into v_prova, v_codice, v_revisione, v_fornitore, v_inizio, v_fine
    from public.approvvigionamenti_ordini
    where id = p_ordine_id and deleted_at is null;
    if v_codice is null then
      raise exception 'Ordine non trovato.';
    end if;
    v_ids := array[p_ordine_id];
  end if;
  if v_revisione is distinct from p_revisione then
    raise exception 'La versione è cambiata. Riapri la conferma.';
  end if;
  if coalesce(array_length(v_ids, 1), 0) = 0 then
    raise exception 'Nessuna consegna salvata da allegare.';
  end if;

  select ragione_sociale into v_fornitore_nome
  from public.fornitori
  where id = v_fornitore;
  select case when count(distinct coalesce(note, '')) <= 1 then min(coalesce(note, '')) else null end
    into v_note
  from public.approvvigionamenti_ordini
  where id = any(v_ids);

  if coalesce(v_prova, false) and (
    position('http' in lower(p_oggetto)) > 0 or position('http' in lower(p_testo)) > 0
  ) then
    raise exception 'La mail di prova non può contenere un collegamento.';
  end if;
  if coalesce(v_prova, false) and exists (
    select 1
    from public.fornitori f
    where f.deleted_at is null
      and lower(btrim(coalesce(f.email, ''))) = v_destinatario
  ) then
    raise exception 'In prova non si usa l''indirizzo del fornitore in anagrafica.';
  end if;

  if jsonb_typeof(p_snapshot) <> 'object'
     or jsonb_typeof(p_snapshot->'consegne') <> 'array'
     or p_snapshot->>'codice' is distinct from v_codice
     or p_snapshot->>'fornitore' is distinct from coalesce(v_fornitore_nome, '')
     or (p_snapshot->>'periodoInizio')::date is distinct from v_inizio
     or (p_snapshot->>'periodoFine')::date is distinct from v_fine
     or (
       v_note is not null
       and coalesce(p_snapshot->>'note', '') is distinct from v_note
     )
  then
    raise exception 'Gli allegati non coincidono con le righe salvate.';
  end if;

  select count(distinct m.nome), min(m.nome)
    into v_materie, v_materia
  from public.approvvigionamenti_righe r
  join public.materie_prime m on m.id = r.materia_prima_id
  where r.ordine_id = any(v_ids) and r.deleted_at is null;
  if v_materie = 1 and p_snapshot->>'materia' is distinct from v_materia then
    raise exception 'Gli allegati non coincidono con le righe salvate.';
  end if;
  if (
    select count(*)
    from public.approvvigionamenti_righe r
    where r.ordine_id = any(v_ids) and r.deleted_at is null
  ) <> jsonb_array_length(p_snapshot->'consegne') then
    raise exception 'Gli allegati non coincidono con le righe salvate.';
  end if;

  with attese as (
    select o.data_consegna::text as data,
           r.quantita,
           coalesce(nullif(btrim(r.unita_nome), ''), r.unita_misura) as unita
    from public.approvvigionamenti_righe r
    join public.approvvigionamenti_ordini o on o.id = r.ordine_id
    where o.id = any(v_ids) and o.deleted_at is null and r.deleted_at is null
  ),
  ricevute as (
    select elem->>'data' as data,
           (elem->>'quantita')::numeric as quantita,
           coalesce(elem->>'unita', '') as unita
    from jsonb_array_elements(p_snapshot->'consegne') elem
  )
  select exists (
    (
      select data, quantita, unita from attese
      except
      select data, quantita, unita from ricevute
    )
    union all
    (
      select data, quantita, unita from ricevute
      except
      select data, quantita, unita from attese
    )
  ) into v_diverso;
  if coalesce(v_diverso, true) then
    raise exception 'Gli allegati non coincidono con le righe salvate.';
  end if;

  v_operatore := public.app_effective_uid();
  v_impersonato := case when auth.uid() is distinct from v_operatore then auth.uid() else null end;
  v_richiesto_dest := v_destinatario;
  v_richiesto_oggetto := btrim(p_oggetto);
  v_richiesto_testo := p_testo;
  v_richiesto_pdf := coalesce(p_pdf, false);
  v_richiesto_xlsx := coalesce(p_xlsx, false);
  v_richiesto_snapshot := p_snapshot;
  v_richiesto_ordine := p_ordine_id;
  v_richiesto_piano := p_piano_id;

  insert into public.approvvigionamenti_invii (
    prova, ordine_id, piano_id, revisione, chiave, destinatario, oggetto, testo,
    allega_pdf, allega_xlsx, snapshot, notifica_stato, operatore_id, impersonato_da,
    created_by, updated_by
  )
  values (
    coalesce(v_prova, false), p_ordine_id, p_piano_id, v_revisione, p_chiave,
    v_destinatario, btrim(p_oggetto), p_testo, coalesce(p_pdf, false), coalesce(p_xlsx, false),
    p_snapshot, 'non_inviata', v_operatore, v_impersonato, v_operatore, v_operatore
  )
  on conflict (chiave) do nothing
  returning id, notifica_stato, snapshot into v_id, v_stato, v_snapshot;

  if v_id is null then
    select id, notifica_stato, snapshot, destinatario, oggetto, testo, allega_pdf, allega_xlsx, ordine_id, piano_id
      into v_id, v_stato, v_snapshot, v_destinatario, v_riga_oggetto, v_riga_testo, v_riga_pdf, v_riga_xlsx, v_riga_ordine, v_riga_piano
    from public.approvvigionamenti_invii
    where chiave = p_chiave and deleted_at is null;
    if v_id is null
       or v_destinatario is distinct from v_richiesto_dest
       or v_riga_oggetto is distinct from v_richiesto_oggetto
       or v_riga_testo is distinct from v_richiesto_testo
       or v_riga_pdf is distinct from v_richiesto_pdf
       or v_riga_xlsx is distinct from v_richiesto_xlsx
       or v_riga_ordine is distinct from v_richiesto_ordine
       or v_riga_piano is distinct from v_richiesto_piano
       or v_snapshot is distinct from v_richiesto_snapshot
    then
      raise exception 'La chiave è già stata usata per un altro invio.';
    end if;
    return jsonb_build_object(
      'riusata', true, 'id', v_id, 'stato', v_stato, 'snapshot', v_snapshot,
      'oggetto', v_riga_oggetto, 'testo', v_riga_testo, 'pdf', v_riga_pdf, 'xlsx', v_riga_xlsx,
      'destinatario', v_destinatario
    );
  end if;

  return jsonb_build_object(
    'riusata', false, 'id', v_id, 'stato', v_stato, 'snapshot', v_snapshot,
    'oggetto', v_richiesto_oggetto, 'testo', v_richiesto_testo,
    'pdf', v_richiesto_pdf, 'xlsx', v_richiesto_xlsx, 'destinatario', v_richiesto_dest
  );
end;
$$;

revoke all on function public.prenota_invio_approvvigionamento(text, uuid, uuid, integer, text, text, text, boolean, boolean, jsonb) from public, anon;
grant execute on function public.prenota_invio_approvvigionamento(text, uuid, uuid, integer, text, text, text, boolean, boolean, jsonb) to authenticated;

create or replace function public.acquisisci_invio_approvvigionamento(
  p_id uuid,
  p_conferma_incerta boolean
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_lock uuid;
  v_stato text;
  v_tentativo integer;
begin
  if not public.approvvigionamento_autorizzato() then
    raise exception 'Non autorizzato a inviare';
  end if;
  update public.approvvigionamenti_invii r
  set
    notifica_stato = 'in_invio',
    notifica_lock = gen_random_uuid(),
    notifica_lock_at = now(),
    notifica_tentativi = r.notifica_tentativi + 1,
    notifica_errore = null,
    notifica_message_id = null,
    updated_by = public.app_effective_uid()
  where r.id = p_id
    and r.deleted_at is null
    and r.annullato_at is null
    and (
      r.notifica_stato in ('non_inviata', 'fallita')
      or (coalesce(p_conferma_incerta, false) and r.notifica_stato = 'incerta')
      or (
        coalesce(p_conferma_incerta, false)
        and r.notifica_stato = 'in_invio'
        and r.notifica_lock_at <= now() - interval '1080 seconds'
      )
    )
  returning r.notifica_lock, r.notifica_stato, r.notifica_tentativi
    into v_lock, v_stato, v_tentativo;

  if v_lock is not null then
    return jsonb_build_object(
      'acquisita', true, 'lock', v_lock, 'stato', v_stato, 'tentativo', v_tentativo
    );
  end if;

  select notifica_stato into v_stato
  from public.approvvigionamenti_invii
  where id = p_id and deleted_at is null;
  return jsonb_build_object(
    'acquisita', false, 'lock', null, 'stato', coalesce(v_stato, 'non_inviata'), 'tentativo', 0
  );
end;
$$;

revoke all on function public.acquisisci_invio_approvvigionamento(uuid, boolean) from public, anon;
grant execute on function public.acquisisci_invio_approvvigionamento(uuid, boolean) to authenticated;

create or replace function public.concludi_invio_approvvigionamento(
  p_id uuid,
  p_lock uuid,
  p_esito text,
  p_errore text,
  p_message_id text
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_id uuid;
  v_stato text;
begin
  if not public.approvvigionamento_autorizzato() then
    raise exception 'Non autorizzato a concludere l''invio';
  end if;
  if p_esito not in ('inviata', 'fallita', 'incerta') then
    raise exception 'Esito invio non valido';
  end if;
  update public.approvvigionamenti_invii
  set
    notifica_stato = p_esito,
    notifica_lock = null,
    notifica_lock_at = null,
    notifica_errore = left(p_errore, 500),
    notifica_message_id = nullif(left(coalesce(p_message_id, ''), 200), ''),
    notifica_at = case when p_esito = 'inviata' then now() else null end,
    updated_by = public.app_effective_uid()
  where id = p_id
    and deleted_at is null
    and annullato_at is null
    and notifica_stato = 'in_invio'
    and notifica_lock = p_lock
  returning id, notifica_stato into v_id, v_stato;
  if v_id is null then
    select notifica_stato into v_stato
    from public.approvvigionamenti_invii
    where id = p_id and deleted_at is null;
    return jsonb_build_object('aggiornata', false, 'stato', coalesce(v_stato, 'non_inviata'));
  end if;
  return jsonb_build_object('aggiornata', true, 'stato', v_stato);
end;
$$;

revoke all on function public.concludi_invio_approvvigionamento(uuid, uuid, text, text, text) from public, anon;
grant execute on function public.concludi_invio_approvvigionamento(uuid, uuid, text, text, text) to authenticated;

create or replace function public.leggi_invio_approvvigionamento(p_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_riga public.approvvigionamenti_invii%rowtype;
begin
  if not public.approvvigionamento_autorizzato() then
    raise exception 'Non autorizzato';
  end if;
  select * into v_riga
  from public.approvvigionamenti_invii
  where id = p_id and deleted_at is null;
  if v_riga.id is null then
    raise exception 'Invio non trovato.';
  end if;
  return jsonb_build_object(
    'id', v_riga.id,
    'stato', v_riga.notifica_stato,
    'prova', v_riga.prova,
    'destinatario', v_riga.destinatario,
    'oggetto', v_riga.oggetto,
    'testo', v_riga.testo,
    'pdf', v_riga.allega_pdf,
    'xlsx', v_riga.allega_xlsx,
    'snapshot', v_riga.snapshot,
    'errore', v_riga.notifica_errore
  );
end;
$$;

revoke all on function public.leggi_invio_approvvigionamento(uuid) from public, anon;
grant execute on function public.leggi_invio_approvvigionamento(uuid) to authenticated;

create or replace function public.elimina_dati_prova_approvvigionamento()
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_annullati integer := 0;
  v_invii integer := 0;
  v_ordini integer := 0;
  v_piani integer := 0;
  v_protetti integer := 0;
begin
  if not public.approvvigionamento_autorizzato() then
    raise exception 'Non autorizzato a eliminare i dati di prova';
  end if;

  drop table if exists _protetti_invii;
  drop table if exists _ordini_protetti;
  drop table if exists _piani_protetti;
  drop table if exists _ordini_target;
  drop table if exists _piani_target;

  create temporary table _protetti_invii (
    id uuid primary key,
    ordine_id uuid,
    piano_id uuid
  ) on commit drop;
  insert into _protetti_invii (id, ordine_id, piano_id)
  select id, ordine_id, piano_id
  from public.approvvigionamenti_invii
  where prova is true
    and deleted_at is null
    and annullato_at is null
    and notifica_stato in ('in_invio', 'incerta');

  create temporary table _ordini_protetti (id uuid primary key) on commit drop;
  create temporary table _piani_protetti (id uuid primary key) on commit drop;

  insert into _ordini_protetti (id)
  select ordine_id from _protetti_invii where ordine_id is not null
  on conflict do nothing;
  insert into _piani_protetti (id)
  select piano_id from _protetti_invii where piano_id is not null
  on conflict do nothing;
  insert into _piani_protetti (id)
  select po.piano_id
  from public.approvvigionamenti_piani_ordini po
  where po.ordine_id in (select id from _ordini_protetti)
  on conflict do nothing;
  insert into _ordini_protetti (id)
  select po.ordine_id
  from public.approvvigionamenti_piani_ordini po
  where po.piano_id in (select id from _piani_protetti)
  on conflict do nothing;

  insert into _ordini_protetti (id)
  select v.ordine_id
  from public.approvvigionamenti_versioni v
  join public.approvvigionamenti_notifiche n on n.versione_ordine_id = v.id
  join public.approvvigionamenti_ordini o on o.id = v.ordine_id
  where o.prova is true
    and n.deleted_at is null
    and n.notifica_stato in ('in_invio', 'incerta')
  on conflict do nothing;
  insert into _piani_protetti (id)
  select v.piano_id
  from public.approvvigionamenti_piani_versioni v
  join public.approvvigionamenti_notifiche n on n.versione_piano_id = v.id
  join public.approvvigionamenti_piani p on p.id = v.piano_id
  where p.prova is true
    and n.deleted_at is null
    and n.notifica_stato in ('in_invio', 'incerta')
  on conflict do nothing;
  insert into _ordini_protetti (id)
  select c.ordine_id
  from public.approvvigionamenti_carichi c
  join public.approvvigionamenti_ordini o on o.id = c.ordine_id
  where o.prova is true and c.deleted_at is null
  on conflict do nothing;
  insert into _piani_protetti (id)
  select po.piano_id
  from public.approvvigionamenti_piani_ordini po
  where po.ordine_id in (select id from _ordini_protetti)
  on conflict do nothing;
  insert into _ordini_protetti (id)
  select po.ordine_id
  from public.approvvigionamenti_piani_ordini po
  where po.piano_id in (select id from _piani_protetti)
  on conflict do nothing;

  create temporary table _ordini_target (id uuid primary key) on commit drop;
  create temporary table _piani_target (id uuid primary key) on commit drop;
  insert into _ordini_target (id)
  select id from public.approvvigionamenti_ordini
  where prova is true and id not in (select id from _ordini_protetti);
  insert into _piani_target (id)
  select id from public.approvvigionamenti_piani
  where prova is true and id not in (select id from _piani_protetti);

  if exists (
    select 1
    from _ordini_target t
    join public.approvvigionamenti_ordini o on o.id = t.id
    where o.prova is not true
  ) or exists (
    select 1
    from _piani_target t
    join public.approvvigionamenti_piani p on p.id = t.id
    where p.prova is not true
  ) then
    raise exception 'Rifiutata la cancellazione di dati non di prova.';
  end if;

  update public.approvvigionamenti_invii
  set annullato_at = now(), updated_by = public.app_effective_uid()
  where prova is true
    and notifica_stato = 'non_inviata'
    and annullato_at is null
    and id not in (select id from _protetti_invii);
  get diagnostics v_annullati = row_count;

  delete from public.approvvigionamenti_invii
  where prova is true
    and id not in (select id from _protetti_invii);
  get diagnostics v_invii = row_count;

  delete from public.approvvigionamenti_notifiche n
  using public.approvvigionamenti_versioni v
  where n.versione_ordine_id = v.id
    and v.ordine_id in (select id from _ordini_target);
  delete from public.approvvigionamenti_notifiche n
  using public.approvvigionamenti_piani_versioni v
  where n.versione_piano_id = v.id
    and v.piano_id in (select id from _piani_target);
  delete from public.approvvigionamenti_prese_visione p
  using public.approvvigionamenti_versioni v
  where p.versione_ordine_id = v.id
    and v.ordine_id in (select id from _ordini_target);
  delete from public.approvvigionamenti_prese_visione p
  using public.approvvigionamenti_piani_versioni v
  where p.versione_piano_id = v.id
    and v.piano_id in (select id from _piani_target);
  delete from public.approvvigionamenti_risposte_fornitore
  where ordine_id in (select id from _ordini_target);
  delete from public.approvvigionamenti_proposte_piano
  where piano_id in (select id from _piani_target);
  delete from public.approvvigionamenti_versioni
  where ordine_id in (select id from _ordini_target);
  delete from public.approvvigionamenti_piani_versioni
  where piano_id in (select id from _piani_target);
  delete from public.approvvigionamenti_piani_ordini
  where ordine_id in (select id from _ordini_target)
     or piano_id in (select id from _piani_target);
  delete from public.approvvigionamenti_righe
  where ordine_id in (select id from _ordini_target);
  delete from public.approvvigionamenti_operazioni_ordini
  where ordine_id in (select id from _ordini_target);
  delete from public.approvvigionamenti_ordini
  where prova is true and id in (select id from _ordini_target);
  get diagnostics v_ordini = row_count;
  delete from public.approvvigionamenti_piani
  where prova is true and id in (select id from _piani_target);
  get diagnostics v_piani = row_count;
  delete from public.approvvigionamenti_operazioni o
  where o.impronta->>'_prova' = 'true'
    and not exists (
      select 1 from public.approvvigionamenti_operazioni_ordini l where l.operazione_id = o.id
    );

  select
    (select count(*) from _protetti_invii)
    + (select count(*) from public.approvvigionamenti_carichi c
       join public.approvvigionamenti_ordini o on o.id = c.ordine_id
       where o.prova is true and c.deleted_at is null)
    + (select count(*) from public.approvvigionamenti_notifiche n
       join public.approvvigionamenti_versioni v on v.id = n.versione_ordine_id
       join public.approvvigionamenti_ordini o on o.id = v.ordine_id
       where o.prova is true
         and n.deleted_at is null
         and n.notifica_stato in ('in_invio', 'incerta'))
  into v_protetti;

  return jsonb_build_object(
    'ordini', v_ordini,
    'piani', v_piani,
    'inviiAnnullati', v_annullati,
    'inviiEliminati', v_invii,
    'protetti', v_protetti
  );
end;
$$;

comment on function public.elimina_dati_prova_approvvigionamento() is
  'Cancella solo i dati di prova. Non accetta id dal client. Conserva invii in corso o incerti.';

revoke all on function public.elimina_dati_prova_approvvigionamento() from public, anon;
grant execute on function public.elimina_dati_prova_approvvigionamento() to authenticated;

notify pgrst, 'reload schema';
