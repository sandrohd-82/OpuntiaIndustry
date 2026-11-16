-- Ciclo di consegna: risposta del fornitore, DDT di approvvigionamento,
-- partenza, arrivo e chiusura del foglio HACCP già esistente.
-- Non riusa ddt_documenti (archivio fiscale). Non numera lotti LM-.
-- Non accetta il carico e non scrive la giacenza.

alter table public.haccp_fogli_ingresso
  add column if not exists departed_at timestamptz,
  add column if not exists departed_by uuid;

comment on column public.haccp_fogli_ingresso.departed_at is
  'Ora in cui il fornitore registra la partenza. Non è la quantità arrivata.';

create table if not exists public.approvvigionamenti_risposte_fornitore (
  id uuid primary key default gen_random_uuid(),
  ordine_id uuid not null references public.approvvigionamenti_ordini (id),
  versione_id uuid not null references public.approvvigionamenti_versioni (id),
  fornitore_id uuid not null references public.fornitori (id),
  tipo text not null check (tipo in ('conferma', 'proposta', 'indisponibilita', 'rifiuto')),
  stato text not null check (stato in ('in_esame', 'accettata', 'respinta')),
  motivazione text not null,
  data_consegna_proposta date,
  righe jsonb not null default '[]'::jsonb,
  chiave text not null unique,
  decisa_at timestamptz,
  decisa_by uuid,
  decisione_nota text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  created_by uuid,
  updated_by uuid,
  deleted_at timestamptz,
  deleted_by uuid
);

create unique index if not exists approvvigionamenti_risposte_versione_attiva_uidx
  on public.approvvigionamenti_risposte_fornitore (versione_id)
  where deleted_at is null;

comment on table public.approvvigionamenti_risposte_fornitore is
  'Risposta del fornitore a una versione pubblicata. Non modifica lo snapshot.';

drop trigger if exists approvvigionamenti_risposte_fornitore_updated_at
  on public.approvvigionamenti_risposte_fornitore;
create trigger approvvigionamenti_risposte_fornitore_updated_at
  before update on public.approvvigionamenti_risposte_fornitore
  for each row execute function public.set_updated_at();

create table if not exists public.approvvigionamenti_ddt (
  id uuid primary key default gen_random_uuid(),
  carico_id uuid not null references public.approvvigionamenti_carichi (id),
  foglio_id uuid not null references public.haccp_fogli_ingresso (id),
  numero text not null,
  data_documento date not null,
  allegato_path text,
  allegato_nome text,
  righe jsonb not null,
  stato text not null default 'registrato' check (stato in ('bozza', 'registrato')),
  versione integer not null default 1 check (versione > 0),
  chiave text not null unique,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  created_by uuid,
  updated_by uuid,
  deleted_at timestamptz,
  deleted_by uuid
);

create unique index if not exists approvvigionamenti_ddt_carico_attivo_uidx
  on public.approvvigionamenti_ddt (carico_id)
  where deleted_at is null;

comment on table public.approvvigionamenti_ddt is
  'DDT della consegna di approvvigionamento. Non è ddt_documenti e non è un documento fiscale.';

drop trigger if exists approvvigionamenti_ddt_updated_at on public.approvvigionamenti_ddt;
create trigger approvvigionamenti_ddt_updated_at
  before update on public.approvvigionamenti_ddt
  for each row execute function public.set_updated_at();

create or replace function public.haccp_foglio_ingresso_proteggi()
returns trigger
language plpgsql
as $$
declare
  v_mancante text;
begin
  if new.fornitore_id is distinct from old.fornitore_id
     or new.codice is distinct from old.codice
     or new.opened_at is distinct from old.opened_at
     or new.opened_by is distinct from old.opened_by
     or new.created_by is distinct from old.created_by
  then
    raise exception 'Il fornitore del foglio non si modifica';
  end if;

  if new.departed_at is distinct from old.departed_at
     or new.departed_by is distinct from old.departed_by then
    if not (
      old.stato = 'in_compilazione'
      and new.stato = 'partito'
      and old.departed_at is null
    ) then
      raise exception 'La partenza si registra solo al passaggio in partito';
    end if;
  end if;

  if new.arrived_at is distinct from old.arrived_at
     or new.arrived_by is distinct from old.arrived_by then
    if not (
      old.stato = 'partito'
      and new.stato = 'arrivato'
      and old.arrived_at is null
    ) then
      raise exception 'L''arrivo si registra solo al passaggio in arrivo';
    end if;
  end if;

  if new.closed_at is distinct from old.closed_at
     or new.closed_by is distinct from old.closed_by then
    if not (
      old.stato = 'arrivato'
      and new.stato = 'chiuso'
      and old.closed_at is null
    ) then
      raise exception 'La chiusura si registra solo al passaggio in chiuso';
    end if;
  end if;

  if new.stato is distinct from old.stato then
    if old.stato = 'in_compilazione' and new.stato = 'partito' then
      if new.departed_at is null or new.departed_by is null then
        raise exception 'La partenza richiede data e autore';
      end if;
      if public.fornitore_collegato_id() is distinct from new.fornitore_id
         and not public.is_superadmin() then
        raise exception 'La partenza la registra il fornitore';
      end if;
      select u.voce into v_mancante
      from unnest(array[
        'mezzo', '1a', '1b', '1c', '1d', '1e',
        '2a', '2b', '2c', '2d', '2e', '2f', '2g', '2h', '2i', '2l', '2m',
        'n1', 'n2', 'p'
      ]) as u(voce)
      where not exists (
        select 1
        from public.haccp_fogli_ingresso_risposte r
        where r.foglio_id = new.id
          and r.voce_codice = u.voce
      )
      limit 1;
      if v_mancante is not null then
        raise exception 'Mancano voci obbligatorie per la partenza';
      end if;
    elsif old.stato = 'partito' and new.stato = 'arrivato' then
      if new.arrived_at is null or new.arrived_by is null then
        raise exception 'L''arrivo richiede data e autore';
      end if;
      if public.fornitore_collegato_id() is not distinct from new.fornitore_id
         and not public.is_superadmin() then
        raise exception 'L''arrivo lo registra il personale interno';
      end if;
      if not (
        public.is_superadmin()
        or public.has_area_access('produzione')
        or public.has_area_access('magazzino')
        or public.has_area_access('amministrazione')
      ) then
        raise exception 'L''arrivo lo registra il personale interno';
      end if;
      if not exists (
        select 1
        from public.haccp_fogli_ingresso_risposte r
        where r.foglio_id = new.id
          and r.voce_codice = 'q'
      ) then
        raise exception 'Manca la registrazione di arrivo';
      end if;
    elsif old.stato = 'arrivato' and new.stato = 'chiuso' then
      if new.closed_at is null or new.closed_by is null then
        raise exception 'La chiusura richiede data e autore';
      end if;
      if not (
        public.is_superadmin()
        or public.has_area_access('produzione')
        or public.has_area_access('magazzino')
        or public.has_area_access('amministrazione')
      ) then
        raise exception 'La chiusura spetta al personale interno';
      end if;
    elsif not (
      (old.stato = 'aperto' and new.stato in ('in_compilazione', 'in_attesa'))
      or (old.stato = 'in_compilazione' and new.stato = 'in_attesa')
      or (old.stato = 'in_attesa' and new.stato in ('aperto', 'in_compilazione'))
    ) then
      raise exception 'Transizione di stato non consentita';
    end if;
  end if;

  return new;
end;
$$;

create or replace function public.haccp_foglio_risposta_valida()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_fornitore uuid;
  v_stato text;
  v_deleted timestamptz;
  v_interno boolean;
  v_precedente boolean;
  v_testo text;
  v_numero numeric;
begin
  if new.created_by is distinct from public.app_effective_uid()
     or new.confermata_by is distinct from public.app_effective_uid() then
    raise exception 'La risposta si attribuisce solo all''utente collegato';
  end if;

  select f.fornitore_id, f.stato, f.deleted_at
    into v_fornitore, v_stato, v_deleted
  from public.haccp_fogli_ingresso f
  where f.id = new.foglio_id;

  if v_fornitore is null or v_deleted is not null then
    raise exception 'Foglio non disponibile';
  end if;

  v_interno := (
    public.is_superadmin()
    or public.has_area_access('produzione')
    or public.has_area_access('amministrazione')
  ) and v_fornitore is distinct from public.fornitore_collegato_id();

  if not v_interno and v_fornitore is distinct from public.fornitore_collegato_id() then
    raise exception 'Foglio di un altro fornitore';
  end if;

  if new.voce_codice not in (
    'mezzo', '1a', '1b', '1c', '1d', '1e',
    '2a', '2b', '2c', '2d', '2e', '2f', '2g', '2h', '2i', '2l', '2m',
    'n1', 'n2', 'p', 'q'
  ) then
    raise exception 'Questa voce non è compilabile';
  end if;

  if v_stato in ('aperto', 'in_compilazione') and new.voce_codice = 'q' then
    raise exception 'L''arrivo si registra quando il carico è partito';
  end if;
  if v_stato not in ('aperto', 'in_compilazione') then
    if not (new.voce_codice = 'q' and v_stato in ('partito', 'arrivato')) then
      raise exception 'Il foglio non è in compilazione';
    end if;
  end if;
  if new.voce_codice = 'q' and not v_interno then
    raise exception 'La voce q non è del fornitore';
  end if;

  if not v_interno and new.voce_codice <> 'q' and exists (
    select 1
    from public.haccp_fogli_ingresso_linee l
    where l.foglio_id = new.foglio_id
      and not exists (
        select 1
        from public.haccp_linee_guida_prese_visione p
        where p.versione_id = l.versione_id
          and p.profile_id = public.app_effective_uid()
          and p.fornitore_id = v_fornitore
      )
  ) then
    raise exception 'Prima conferma la presa visione della versione applicabile';
  end if;

  select exists (
    select 1
    from public.haccp_fogli_ingresso_risposte r
    where r.foglio_id = new.foglio_id
      and r.voce_codice = new.voce_codice
  ) into v_precedente;

  if v_precedente and char_length(btrim(coalesce(new.motivazione, ''))) < 3 then
    raise exception 'La correzione richiede una motivazione';
  end if;
  if v_interno and not v_precedente and new.voce_codice <> 'q' then
    raise exception 'Il personale interno corregge una risposta già registrata';
  end if;

  if new.voce_codice in ('mezzo', '1e', '2b', '2g', '2h') then
    if new.valore->>'tipo' is distinct from 'controllo'
       or new.valore->>'esito' not in ('conforme', 'non_conforme') then
      raise exception 'Valore del controllo non valido';
    end if;
  elsif new.voce_codice in ('2a', '2c') then
    v_testo := btrim(coalesce(new.valore->>'testo', ''));
    if new.valore->>'tipo' is distinct from 'dato_testo'
       or char_length(v_testo) < 1
       or char_length(v_testo) > 500 then
      raise exception 'Testo non valido';
    end if;
  elsif new.voce_codice in ('2d', '2i', '2l') then
    v_numero := nullif(new.valore->>'valore', '')::numeric;
    if new.valore->>'tipo' is distinct from 'dato_numero'
       or v_numero is null
       or v_numero <= 0
       or v_numero > 1000000 then
      raise exception 'Numero non valido';
    end if;
    if new.voce_codice = '2l' and new.valore->>'unita' is distinct from 'kg' then
      raise exception 'Il peso è in kg';
    end if;
    if new.voce_codice in ('2d', '2i') and (
      new.valore->>'unita' is distinct from 'n' or v_numero <> trunc(v_numero)
    ) then
      raise exception 'Il numero di contenitori deve essere intero';
    end if;
  elsif new.voce_codice = '2e' then
    v_testo := btrim(coalesce(new.valore->>'codice', ''));
    if new.valore->>'tipo' is distinct from 'lotto'
       or char_length(v_testo) < 1
       or char_length(v_testo) > 40 then
      raise exception 'Codice lotto non valido';
    end if;
  elsif new.voce_codice = '1c' then
    if new.valore->>'tipo' is distinct from 'segnalazione'
       or new.valore->>'presente' not in ('true', 'false') then
      raise exception 'Segnalazione non valida';
    end if;
    if new.valore->>'presente' = 'true'
       and char_length(btrim(coalesce(new.valore->>'nota', ''))) < 3 then
      raise exception 'Descrivi il materiale da rimuovere';
    end if;
  elsif new.voce_codice = '1d' then
    if new.valore->>'tipo' is distinct from 'contatto'
       or new.valore->>'esito' not in ('carico_possibile', 'in_attesa')
       or char_length(btrim(coalesce(new.valore->>'nota', ''))) < 3 then
      raise exception 'Esito del contatto non valido';
    end if;
  elsif new.voce_codice in ('1a', '2f') then
    if new.valore->>'tipo' is distinct from 'foto'
       or char_length(btrim(coalesce(new.valore->>'nome', ''))) < 1
       or coalesce(new.valore->>'path', '') not like (new.foglio_id::text || '/%')
       or position('..' in coalesce(new.valore->>'path', '')) > 0 then
      raise exception 'Fotografia non valida';
    end if;
  elsif new.voce_codice = '1b' then
    if new.valore->>'tipo' is distinct from 'archivio'
       or not exists (
         select 1
         from public.haccp_fogli_ingresso_risposte r
         where r.foglio_id = new.foglio_id
           and r.voce_codice = '1a'
           and r.valore->>'path' = new.valore->>'path'
       ) then
      raise exception 'Conferma la foto già archiviata';
    end if;
  elsif new.voce_codice = '2m' then
    v_numero := nullif(new.valore->>'quantita', '')::numeric;
    if new.valore->>'tipo' is distinct from 'ddt'
       or char_length(btrim(coalesce(new.valore->>'numero', ''))) < 1
       or char_length(btrim(coalesce(new.valore->>'numero', ''))) > 40
       or coalesce(new.valore->>'data', '') !~ '^\d{4}-\d{2}-\d{2}$'
       or v_numero is null
       or v_numero <= 0 then
      raise exception 'DDT non valido';
    end if;
  elsif new.voce_codice in ('n1', 'n2') then
    if new.valore->>'tipo' is distinct from 'firma'
       or new.valore->>'evidenza' is distinct from 'sessione_autenticata'
       or char_length(btrim(coalesce(new.valore->>'nome', ''))) < 3 then
      raise exception 'Firma non valida';
    end if;
    if new.voce_codice = 'n2'
       and char_length(btrim(coalesce(new.valore->>'telefono', ''))) < 6 then
      raise exception 'Telefono del trasportatore mancante';
    end if;
  elsif new.voce_codice = 'p' then
    if new.valore->>'tipo' is distinct from 'orario'
       or coalesce(new.valore->>'iso', '') !~ '^\d{4}-\d{2}-\d{2}T' then
      raise exception 'Ora di partenza non valida';
    end if;
  elsif new.voce_codice = 'q' then
    if new.valore->>'tipo' is distinct from 'arrivo'
       or char_length(btrim(coalesce(new.valore->>'nota', ''))) < 3 then
      raise exception 'Annotazione di arrivo non valida';
    end if;
  end if;

  return new;
end;
$$;

create or replace function public.registra_risposta_fornitore_approvvigionamento(
  p_chiave text,
  p_versione_id uuid,
  p_tipo text,
  p_motivazione text,
  p_data_consegna date,
  p_righe jsonb
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_ordine uuid;
  v_fornitore uuid;
  v_numero integer;
  v_pubblicata integer;
  v_stato text;
  v_deleted timestamptz;
  v_id uuid;
  v_stato_risposta text;
  v_motivazione text;
  v_righe jsonb;
  v_tipo_esistente text;
begin
  if public.fornitore_collegato_id() is null then
    raise exception 'Nessuna anagrafica fornitore collegata';
  end if;
  if p_chiave is null or char_length(btrim(p_chiave)) < 8 then
    raise exception 'Chiave operazione non valida';
  end if;
  if p_tipo not in ('conferma', 'proposta', 'indisponibilita', 'rifiuto') then
    raise exception 'Tipo di risposta non valido';
  end if;

  v_motivazione := btrim(coalesce(p_motivazione, ''));
  if p_tipo = 'conferma' and v_motivazione = '' then
    v_motivazione := 'Conferma dell''ordine pubblicato.';
  end if;
  if char_length(v_motivazione) < 3 then
    raise exception 'La risposta richiede una motivazione';
  end if;
  v_righe := coalesce(p_righe, '[]'::jsonb);
  if jsonb_typeof(v_righe) <> 'array' then
    raise exception 'Le righe della risposta non sono valide';
  end if;
  if p_tipo = 'proposta' and p_data_consegna is null and jsonb_array_length(v_righe) = 0 then
    raise exception 'La proposta indica una data o delle quantità';
  end if;

  select v.ordine_id, v.fornitore_id, v.numero
    into v_ordine, v_fornitore, v_numero
  from public.approvvigionamenti_versioni v
  where v.id = p_versione_id
  for update;

  if v_ordine is null then
    raise exception 'Versione non disponibile';
  end if;
  if v_fornitore is distinct from public.fornitore_collegato_id() then
    raise exception 'Ordine di un altro fornitore';
  end if;

  select o.versione_pubblicata, o.stato, o.deleted_at
    into v_pubblicata, v_stato, v_deleted
  from public.approvvigionamenti_ordini o
  where o.id = v_ordine
  for update;

  if v_deleted is not null or v_pubblicata is null or v_numero <> v_pubblicata
     or v_stato not in ('pubblicato', 'da_ripubblicare') then
    raise exception 'Si risponde solo alla versione pubblicata corrente';
  end if;

  select id, tipo, stato
    into v_id, v_tipo_esistente, v_stato_risposta
  from public.approvvigionamenti_risposte_fornitore
  where chiave = p_chiave;

  if v_id is not null then
    if v_tipo_esistente is distinct from p_tipo then
      raise exception 'La chiave è già stata usata per un''altra risposta';
    end if;
    return jsonb_build_object('id', v_id, 'riusata', true, 'stato', v_stato_risposta);
  end if;

  if exists (
    select 1
    from public.approvvigionamenti_risposte_fornitore
    where versione_id = p_versione_id
      and deleted_at is null
  ) then
    raise exception 'Questa versione ha già una risposta';
  end if;

  v_stato_risposta := case when p_tipo = 'conferma' then 'accettata' else 'in_esame' end;

  insert into public.approvvigionamenti_risposte_fornitore (
    ordine_id, versione_id, fornitore_id, tipo, stato, motivazione,
    data_consegna_proposta, righe, chiave, created_by, updated_by
  ) values (
    v_ordine, p_versione_id, v_fornitore, p_tipo, v_stato_risposta, v_motivazione,
    case when p_tipo = 'proposta' then p_data_consegna else null end,
    v_righe, p_chiave, public.app_effective_uid(), public.app_effective_uid()
  )
  returning id into v_id;

  return jsonb_build_object('id', v_id, 'riusata', false, 'stato', v_stato_risposta);
end;
$$;

comment on function public.registra_risposta_fornitore_approvvigionamento(text, uuid, text, text, date, jsonb) is
  'Registra la risposta del fornitore. Non aggiorna la versione pubblicata.';

create or replace function public.decidi_risposta_fornitore_approvvigionamento(
  p_chiave text,
  p_risposta_id uuid,
  p_esito text,
  p_nota text
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_stato text;
  v_deleted timestamptz;
  v_nota text;
begin
  if not (public.is_superadmin() or public.has_area_access('produzione')) then
    raise exception 'Non autorizzato a decidere la risposta';
  end if;
  if p_chiave is null or char_length(btrim(p_chiave)) < 8 then
    raise exception 'Chiave operazione non valida';
  end if;
  if p_esito not in ('accettata', 'respinta') then
    raise exception 'Esito non valido';
  end if;
  v_nota := btrim(coalesce(p_nota, ''));
  if char_length(v_nota) < 3 then
    raise exception 'La decisione richiede una motivazione';
  end if;

  select stato, deleted_at
    into v_stato, v_deleted
  from public.approvvigionamenti_risposte_fornitore
  where id = p_risposta_id
  for update;

  if v_stato is null or v_deleted is not null then
    raise exception 'Risposta non disponibile';
  end if;
  if v_stato <> 'in_esame' then
    if exists (
      select 1
      from public.approvvigionamenti_risposte_fornitore
      where id = p_risposta_id
        and decisione_nota = v_nota
        and stato = p_esito
    ) then
      return jsonb_build_object('id', p_risposta_id, 'riusata', true, 'stato', v_stato);
    end if;
    raise exception 'La risposta non è più in esame';
  end if;

  update public.approvvigionamenti_risposte_fornitore
  set stato = p_esito,
      decisa_at = now(),
      decisa_by = public.app_effective_uid(),
      decisione_nota = v_nota,
      updated_by = public.app_effective_uid()
  where id = p_risposta_id;

  return jsonb_build_object('id', p_risposta_id, 'riusata', false, 'stato', p_esito);
end;
$$;

comment on function public.decidi_risposta_fornitore_approvvigionamento(text, uuid, text, text) is
  'Accetta o respinge una proposta. Non pubblica una nuova versione.';

create or replace function public.registra_ddt_approvvigionamento(
  p_chiave text,
  p_carico_id uuid,
  p_numero text,
  p_data date,
  p_allegato_path text,
  p_allegato_nome text,
  p_righe jsonb,
  p_motivazione text
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_fornitore uuid;
  v_foglio uuid;
  v_deleted timestamptz;
  v_id uuid;
  v_numero text;
  v_righe jsonb;
  v_versione integer := 1;
  v_precedente uuid;
  v_autorizzato boolean;
begin
  v_autorizzato :=
    public.is_superadmin()
    or public.has_area_access('produzione')
    or public.fornitore_collegato_id() is not null;
  if not v_autorizzato then
    raise exception 'Non autorizzato a registrare il DDT';
  end if;
  if p_chiave is null or char_length(btrim(p_chiave)) < 8 then
    raise exception 'Chiave operazione non valida';
  end if;
  v_numero := btrim(coalesce(p_numero, ''));
  if char_length(v_numero) < 1 or char_length(v_numero) > 40 or p_data is null then
    raise exception 'Numero o data del DDT non validi';
  end if;
  v_righe := coalesce(p_righe, '[]'::jsonb);
  if jsonb_typeof(v_righe) <> 'array' or jsonb_array_length(v_righe) = 0 then
    raise exception 'Il DDT indica le quantità dichiarate';
  end if;

  select id into v_id
  from public.approvvigionamenti_ddt
  where chiave = p_chiave;
  if v_id is not null then
    return jsonb_build_object('id', v_id, 'riusata', true);
  end if;

  select fornitore_id, foglio_id, deleted_at
    into v_fornitore, v_foglio, v_deleted
  from public.approvvigionamenti_carichi
  where id = p_carico_id
  for update;

  if v_fornitore is null or v_deleted is not null or v_foglio is null then
    raise exception 'Carico non disponibile';
  end if;
  if public.fornitore_collegato_id() is not null
     and public.fornitore_collegato_id() is distinct from v_fornitore
     and not (public.is_superadmin() or public.has_area_access('produzione')) then
    raise exception 'DDT di un altro fornitore';
  end if;
  if p_allegato_path is not null and (
    p_allegato_path not like (v_foglio::text || '/%')
    or position('..' in p_allegato_path) > 0
  ) then
    raise exception 'Allegato DDT non valido';
  end if;

  select id, versione
    into v_precedente, v_versione
  from public.approvvigionamenti_ddt
  where carico_id = p_carico_id
    and deleted_at is null
  for update;

  if v_precedente is not null then
    if char_length(btrim(coalesce(p_motivazione, ''))) < 3 then
      raise exception 'La sostituzione del DDT richiede una motivazione';
    end if;
    update public.approvvigionamenti_ddt
    set deleted_at = now(),
        deleted_by = public.app_effective_uid(),
        updated_by = public.app_effective_uid()
    where id = v_precedente;
    v_versione := v_versione + 1;
  else
    v_versione := 1;
  end if;

  insert into public.approvvigionamenti_ddt (
    carico_id, foglio_id, numero, data_documento, allegato_path, allegato_nome,
    righe, stato, versione, chiave, created_by, updated_by
  ) values (
    p_carico_id, v_foglio, v_numero, p_data, p_allegato_path, p_allegato_nome,
    v_righe, 'registrato', v_versione, p_chiave,
    public.app_effective_uid(), public.app_effective_uid()
  )
  returning id into v_id;

  return jsonb_build_object('id', v_id, 'riusata', false, 'versione', v_versione);
end;
$$;

comment on function public.registra_ddt_approvvigionamento(text, uuid, text, date, text, text, jsonb, text) is
  'Registra il DDT di consegna sul carico e sul foglio HACCP. Non copia la quantità arrivata.';

revoke all on function public.registra_risposta_fornitore_approvvigionamento(text, uuid, text, text, date, jsonb)
  from public, anon, service_role;
revoke all on function public.decidi_risposta_fornitore_approvvigionamento(text, uuid, text, text)
  from public, anon, service_role;
revoke all on function public.registra_ddt_approvvigionamento(text, uuid, text, date, text, text, jsonb, text)
  from public, anon, service_role;
grant execute on function public.registra_risposta_fornitore_approvvigionamento(text, uuid, text, text, date, jsonb)
  to authenticated;
grant execute on function public.decidi_risposta_fornitore_approvvigionamento(text, uuid, text, text)
  to authenticated;
grant execute on function public.registra_ddt_approvvigionamento(text, uuid, text, date, text, text, jsonb, text)
  to authenticated;

alter table public.approvvigionamenti_risposte_fornitore enable row level security;
alter table public.approvvigionamenti_ddt enable row level security;

drop policy if exists "approvvigionamenti_risposte_select" on public.approvvigionamenti_risposte_fornitore;
create policy "approvvigionamenti_risposte_select"
  on public.approvvigionamenti_risposte_fornitore for select to authenticated
  using (
    deleted_at is null
    and (
      public.is_superadmin()
      or public.has_area_access('produzione')
      or public.has_area_access('magazzino')
      or public.has_area_access('amministrazione')
      or fornitore_id = public.fornitore_collegato_id()
    )
  );

drop policy if exists "approvvigionamenti_ddt_select" on public.approvvigionamenti_ddt;
create policy "approvvigionamenti_ddt_select"
  on public.approvvigionamenti_ddt for select to authenticated
  using (
    deleted_at is null
    and (
      public.is_superadmin()
      or public.has_area_access('produzione')
      or public.has_area_access('magazzino')
      or public.has_area_access('amministrazione')
      or exists (
        select 1
        from public.approvvigionamenti_carichi c
        where c.id = carico_id
          and c.fornitore_id = public.fornitore_collegato_id()
      )
    )
  );

grant select on public.approvvigionamenti_risposte_fornitore to authenticated;
grant select on public.approvvigionamenti_ddt to authenticated;
revoke insert, update, delete on public.approvvigionamenti_risposte_fornitore from authenticated, anon;
revoke insert, update, delete on public.approvvigionamenti_ddt from authenticated, anon;

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'approvvigionamento-consegna',
  'approvvigionamento-consegna',
  false,
  15728640,
  array['image/jpeg', 'image/jpg', 'image/png', 'image/webp', 'application/pdf']
)
on conflict (id) do update set
  file_size_limit = excluded.file_size_limit,
  allowed_mime_types = excluded.allowed_mime_types,
  public = false;

drop policy if exists approvvigionamento_consegna_storage_select on storage.objects;
create policy approvvigionamento_consegna_storage_select
  on storage.objects for select to authenticated
  using (
    bucket_id = 'approvvigionamento-consegna'
    and (
      public.is_superadmin()
      or public.has_area_access('produzione')
      or public.has_area_access('magazzino')
      or public.has_area_access('area-fornitori')
    )
  );

drop policy if exists approvvigionamento_consegna_storage_insert on storage.objects;
create policy approvvigionamento_consegna_storage_insert
  on storage.objects for insert to authenticated
  with check (
    bucket_id = 'approvvigionamento-consegna'
    and (
      public.is_superadmin()
      or public.has_area_access('produzione')
      or public.has_area_access('area-fornitori')
    )
  );

create or replace view public.approvvigionamenti_pronti_identificazione
with (security_invoker = true) as
select
  c.id as carico_id,
  c.codice as carico_codice,
  c.fornitore_id,
  c.stato as carico_stato,
  c.foglio_id,
  f.codice as foglio_codice,
  f.stato as foglio_stato,
  r.materia_prima_id,
  r.quantita_prevista,
  r.quantita_arrivata,
  r.unita_misura,
  d.numero as ddt_numero,
  d.data_documento as ddt_data,
  (
    select btrim(ris.valore->>'codice')
    from public.haccp_fogli_ingresso_risposte ris
    where ris.foglio_id = c.foglio_id
      and ris.voce_codice = '2e'
    order by ris.confermata_at desc
    limit 1
  ) as lotto_dichiarato
from public.approvvigionamenti_carichi c
join public.haccp_fogli_ingresso f on f.id = c.foglio_id
join public.approvvigionamenti_carichi_righe r on r.carico_id = c.id
left join public.approvvigionamenti_ddt d
  on d.carico_id = c.id
 and d.deleted_at is null
where c.deleted_at is null
  and f.deleted_at is null;

comment on view public.approvvigionamenti_pronti_identificazione is
  'Dati di consegna letti dal magazzino. Non crea un lotto LM- e non carica la giacenza.';

grant select on public.approvvigionamenti_pronti_identificazione to authenticated;

drop policy if exists "haccp_fogli_ingresso_update" on public.haccp_fogli_ingresso;
create policy "haccp_fogli_ingresso_update"
  on public.haccp_fogli_ingresso for update to authenticated
  using (
    public.is_superadmin()
    or public.has_area_access('produzione')
    or public.has_area_access('amministrazione')
    or fornitore_id = public.fornitore_collegato_id()
  )
  with check (
    public.is_superadmin()
    or public.has_area_access('produzione')
    or public.has_area_access('amministrazione')
    or (
      fornitore_id = public.fornitore_collegato_id()
      and stato in ('aperto', 'in_compilazione', 'in_attesa', 'partito')
    )
  );

drop policy if exists "haccp_fogli_ingresso_risposte_insert" on public.haccp_fogli_ingresso_risposte;
create policy "haccp_fogli_ingresso_risposte_insert"
  on public.haccp_fogli_ingresso_risposte for insert to authenticated
  with check (
    created_by = public.app_effective_uid()
    and confermata_by = public.app_effective_uid()
    and exists (
      select 1
      from public.haccp_fogli_ingresso f
      where f.id = foglio_id
        and f.deleted_at is null
        and (
          (
            voce_codice <> 'q'
            and f.stato in ('aperto', 'in_compilazione')
            and (
              public.is_superadmin()
              or public.has_area_access('produzione')
              or public.has_area_access('amministrazione')
              or f.fornitore_id = public.fornitore_collegato_id()
            )
          )
          or (
            voce_codice = 'q'
            and f.stato = 'partito'
            and f.fornitore_id is distinct from public.fornitore_collegato_id()
            and (
              public.is_superadmin()
              or public.has_area_access('produzione')
              or public.has_area_access('amministrazione')
            )
          )
        )
    )
  );
