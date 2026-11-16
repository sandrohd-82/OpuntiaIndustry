-- La pubblicazione non crea distribuzioni.
-- Una distribuzione resta la riga di un documento, una versione e un fornitore.
-- La notifica di quella riga si acquisisce con un solo UPDATE.
-- Non cancella distribuzioni, prese visione né linee guida.

create or replace function public.pubblica_haccp_linea_guida(p_documento_id uuid)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_id uuid;
  v_numero integer;
  v_titolo text;
  v_corpo text;
  v_pubblicata_titolo text;
  v_pubblicata_corpo text;
begin
  if not (
    public.is_superadmin()
    or public.has_area_access('produzione')
    or public.has_area_access('amministrazione')
  ) then
    raise exception 'Non autorizzato a pubblicare le linee guida';
  end if;

  select id, numero, titolo, corpo
    into v_id, v_numero, v_titolo, v_corpo
  from public.haccp_linee_guida_versioni
  where documento_id = p_documento_id
    and stato = 'bozza'
    and deleted_at is null
  for update;

  if v_id is null then
    raise exception 'Nessuna bozza da pubblicare';
  end if;

  select titolo, corpo
    into v_pubblicata_titolo, v_pubblicata_corpo
  from public.haccp_linee_guida_versioni
  where documento_id = p_documento_id
    and stato = 'pubblicata'
    and deleted_at is null
  order by numero desc
  limit 1;

  if v_pubblicata_titolo is not null
     and btrim(v_pubblicata_titolo) = btrim(v_titolo)
     and btrim(v_pubblicata_corpo) = btrim(v_corpo) then
    raise exception 'Nessuna modifica rispetto alla versione pubblicata';
  end if;

  perform set_config('haccp.pubblica', '1', true);

  update public.haccp_linee_guida_versioni
  set stato = 'pubblicata',
      pubblicata_at = now(),
      pubblicata_by = public.app_effective_uid(),
      updated_by = public.app_effective_uid()
  where id = v_id;

  update public.haccp_linee_guida
  set titolo = v_titolo,
      corpo = v_corpo,
      versione = v_numero,
      stato = 'approvato',
      updated_by = public.app_effective_uid()
  where id = p_documento_id
    and deleted_at is null;

  return v_id;
end;
$$;

comment on function public.pubblica_haccp_linea_guida(uuid) is
  'Congela la bozza. Non cambia l''ambito, non crea distribuzioni e non invia mail.';

alter table public.haccp_linee_guida_distribuzioni
  add column if not exists notifica_lock uuid,
  add column if not exists notifica_lock_at timestamptz,
  add column if not exists notifica_tentativi integer not null default 0,
  add column if not exists notifica_message_id text;

alter table public.fornitori_testi_distribuzioni
  add column if not exists notifica_lock uuid,
  add column if not exists notifica_lock_at timestamptz,
  add column if not exists notifica_tentativi integer not null default 0,
  add column if not exists notifica_message_id text;

create unique index if not exists haccp_linee_guida_distribuzioni_lock_uidx
  on public.haccp_linee_guida_distribuzioni (notifica_lock)
  where notifica_lock is not null;

create unique index if not exists fornitori_testi_distribuzioni_lock_uidx
  on public.fornitori_testi_distribuzioni (notifica_lock)
  where notifica_lock is not null;

do $$
declare
  vincolo record;
begin
  for vincolo in
    select nsp.nspname as schema, rel.relname as tabella, con.conname
    from pg_constraint con
    join pg_class rel on rel.oid = con.conrelid
    join pg_namespace nsp on nsp.oid = rel.relnamespace
    where nsp.nspname = 'public'
      and rel.relname in (
        'haccp_linee_guida_distribuzioni',
        'fornitori_testi_distribuzioni'
      )
      and con.contype = 'c'
      and pg_get_constraintdef(con.oid) ilike '%notifica_stato%'
  loop
    execute format(
      'alter table %I.%I drop constraint %I',
      vincolo.schema,
      vincolo.tabella,
      vincolo.conname
    );
  end loop;
end $$;

alter table public.haccp_linee_guida_distribuzioni
  add constraint haccp_linee_guida_distribuzioni_notifica_check check (
    notifica_stato in ('non_inviata', 'in_invio', 'inviata', 'fallita', 'incerta')
    and (
      (notifica_stato = 'inviata' and notifica_at is not null)
      or notifica_stato <> 'inviata'
    )
    and (
      (
        notifica_stato = 'in_invio'
        and notifica_lock is not null
        and notifica_lock_at is not null
      )
      or notifica_stato <> 'in_invio'
    )
  );

alter table public.fornitori_testi_distribuzioni
  add constraint fornitori_testi_distribuzioni_notifica_check check (
    notifica_stato in ('non_inviata', 'in_invio', 'inviata', 'fallita', 'incerta')
    and (
      (notifica_stato = 'inviata' and notifica_at is not null)
      or notifica_stato <> 'inviata'
    )
    and (
      (
        notifica_stato = 'in_invio'
        and notifica_lock is not null
        and notifica_lock_at is not null
      )
      or notifica_stato <> 'in_invio'
    )
  );

create or replace function public.notifica_distribuzione_proteggi()
returns trigger
language plpgsql
as $$
begin
  if new.notifica_stato is distinct from old.notifica_stato
     or new.notifica_lock is distinct from old.notifica_lock
     or new.notifica_lock_at is distinct from old.notifica_lock_at
     or new.notifica_tentativi is distinct from old.notifica_tentativi
     or new.notifica_at is distinct from old.notifica_at
     or new.notifica_errore is distinct from old.notifica_errore
     or new.notifica_message_id is distinct from old.notifica_message_id
  then
    if current_setting('haccp.notifica_distribuzione', true) is distinct from '1' then
      raise exception 'La notifica si aggiorna solo con il lock di invio';
    end if;
  end if;
  return new;
end;
$$;

drop trigger if exists haccp_linee_guida_distribuzioni_notifica_lock
  on public.haccp_linee_guida_distribuzioni;
create trigger haccp_linee_guida_distribuzioni_notifica_lock
  before update on public.haccp_linee_guida_distribuzioni
  for each row execute function public.notifica_distribuzione_proteggi();

drop trigger if exists fornitori_testi_distribuzioni_notifica_lock
  on public.fornitori_testi_distribuzioni;
create trigger fornitori_testi_distribuzioni_notifica_lock
  before update on public.fornitori_testi_distribuzioni
  for each row execute function public.notifica_distribuzione_proteggi();

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
    when p_canale = 'haccp' then
      public.is_superadmin()
      or public.has_area_access('produzione')
      or public.has_area_access('amministrazione')
    when p_canale = 'testo' then
      public.is_superadmin()
      or public.has_area_access('amministrazione')
    else false
  end;
$$;

create or replace function public.acquisisci_notifica_distribuzione(
  p_canale text,
  p_distribuzione_id uuid,
  p_conferma_incerta boolean
)
returns table (
  acquisita boolean,
  lock_id uuid,
  stato text,
  lock_at timestamptz,
  tentativo integer
)
language plpgsql
security definer
set search_path = public
as $$
#variable_conflict use_column
declare
  v_tabella text;
  v_lock uuid;
  v_stato text;
  v_lock_at timestamptz;
  v_tentativo integer;
begin
  if not public.notifica_distribuzione_autorizzata(p_canale) then
    raise exception 'Non autorizzato a inviare la notifica';
  end if;
  v_tabella := public.notifica_distribuzione_tabella(p_canale);
  perform set_config('haccp.notifica_distribuzione', '1', true);

  execute format(
    $q$
      update public.%I r
      set
        notifica_stato = 'in_invio',
        notifica_lock = gen_random_uuid(),
        notifica_lock_at = now(),
        notifica_tentativi = r.notifica_tentativi + 1,
        notifica_errore = null,
        notifica_message_id = null,
        updated_by = public.app_effective_uid()
      where r.id = $1
        and r.deleted_at is null
        and (
          r.notifica_stato in ('non_inviata', 'fallita')
          or ($2 and r.notifica_stato = 'incerta')
          or (
            $2
            and r.notifica_stato = 'in_invio'
            and r.notifica_lock_at <= now() - interval '1080 seconds'
          )
        )
      returning r.notifica_lock, r.notifica_stato, r.notifica_lock_at, r.notifica_tentativi
    $q$,
    v_tabella
  )
  into v_lock, v_stato, v_lock_at, v_tentativo
  using p_distribuzione_id, p_conferma_incerta;

  if v_lock is not null then
    acquisita := true;
    lock_id := v_lock;
    stato := v_stato;
    lock_at := v_lock_at;
    tentativo := v_tentativo;
    return next;
    return;
  end if;

  execute format(
    $q$
      select r.notifica_lock, r.notifica_stato, r.notifica_lock_at, r.notifica_tentativi
      from public.%I r
      where r.id = $1
        and r.deleted_at is null
    $q$,
    v_tabella
  )
  into v_lock, v_stato, v_lock_at, v_tentativo
  using p_distribuzione_id;

  acquisita := false;
  lock_id := v_lock;
  stato := v_stato;
  lock_at := v_lock_at;
  tentativo := v_tentativo;
  return next;
end;
$$;

comment on function public.acquisisci_notifica_distribuzione(text, uuid, boolean) is
  'Un solo UPDATE assegna il lock della distribuzione. Non invia la mail e non crea altre righe.';

create or replace function public.concludi_notifica_distribuzione(
  p_canale text,
  p_distribuzione_id uuid,
  p_lock uuid,
  p_esito text,
  p_errore text,
  p_message_id text
)
returns table (
  aggiornata boolean,
  stato text
)
language plpgsql
security definer
set search_path = public
as $$
#variable_conflict use_column
declare
  v_tabella text;
  v_stato text;
begin
  if not public.notifica_distribuzione_autorizzata(p_canale) then
    raise exception 'Non autorizzato a concludere la notifica';
  end if;
  if p_esito not in ('inviata', 'fallita', 'incerta') then
    raise exception 'Esito notifica non valido';
  end if;
  v_tabella := public.notifica_distribuzione_tabella(p_canale);
  perform set_config('haccp.notifica_distribuzione', '1', true);

  execute format(
    $q$
      update public.%I r
      set
        notifica_stato = $2,
        notifica_at = case when $2 = 'inviata' then now() else null end,
        notifica_errore = nullif(left(coalesce($3, ''), 400), ''),
        notifica_message_id = case
          when $2 = 'inviata' then nullif(left(coalesce($4, ''), 200), '')
          else r.notifica_message_id
        end,
        updated_by = public.app_effective_uid()
      where r.id = $1
        and r.deleted_at is null
        and r.notifica_stato = 'in_invio'
        and r.notifica_lock = $5
      returning r.notifica_stato
    $q$,
    v_tabella
  )
  into v_stato
  using p_distribuzione_id, p_esito, p_errore, p_message_id, p_lock;

  if v_stato is not null then
    aggiornata := true;
    stato := v_stato;
    return next;
    return;
  end if;

  execute format(
    $q$
      select r.notifica_stato
      from public.%I r
      where r.id = $1
        and r.deleted_at is null
    $q$,
    v_tabella
  )
  into v_stato
  using p_distribuzione_id;

  aggiornata := false;
  stato := v_stato;
  return next;
end;
$$;

comment on function public.concludi_notifica_distribuzione(text, uuid, uuid, text, text, text) is
  'Conclude solo il tentativo il cui token è ancora il lock e lo stato è in_invio.';

revoke all on function public.notifica_distribuzione_tabella(text) from public, anon;
revoke all on function public.notifica_distribuzione_autorizzata(text) from public, anon;
revoke all on function public.acquisisci_notifica_distribuzione(text, uuid, boolean) from public, anon;
revoke all on function public.concludi_notifica_distribuzione(text, uuid, uuid, text, text, text) from public, anon;
grant execute on function public.notifica_distribuzione_tabella(text) to authenticated;
grant execute on function public.notifica_distribuzione_autorizzata(text) to authenticated;
grant execute on function public.acquisisci_notifica_distribuzione(text, uuid, boolean) to authenticated;
grant execute on function public.concludi_notifica_distribuzione(text, uuid, uuid, text, text, text) to authenticated;
