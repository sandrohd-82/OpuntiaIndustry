-- Acquisizione atomica della notifica Materiale in ingresso.
-- Non cancella richieste né fogli. Gli stati già registrati restano validi.
--
-- Nodemailer, senza timeout propri su questo invio:
-- connessione 2 minuti, greeting 30 secondi, inattività del socket 10 minuti.
-- La copia IMAP in Inviate, subito dopo l'accettazione, ha socket di 5 minuti.
-- Due minuti coprono solo la connessione. Il recupero di uno stato in_invio
-- senza conclusione è rifiutato prima di 1080 secondi e richiede conferma.

alter table public.haccp_richieste_ingresso
  add column if not exists notifica_lock uuid,
  add column if not exists notifica_lock_at timestamptz,
  add column if not exists notifica_tentativi integer not null default 0,
  add column if not exists notifica_message_id text;

comment on column public.haccp_richieste_ingresso.notifica_lock is
  'Token del tentativo di invio. La conclusione vale solo se coincide.';
comment on column public.haccp_richieste_ingresso.notifica_lock_at is
  'Istante di acquisizione del token.';
comment on column public.haccp_richieste_ingresso.notifica_tentativi is
  'Quanti tentativi hanno acquisito il lock. Non conta le chiamate respinte.';
comment on column public.haccp_richieste_ingresso.notifica_message_id is
  'Message-ID SMTP dell''ultimo tentativo concluso come inviato, se il server lo ha restituito.';

create unique index if not exists haccp_richieste_ingresso_lock_uidx
  on public.haccp_richieste_ingresso (notifica_lock)
  where notifica_lock is not null;

do $$
declare
  vincolo record;
begin
  for vincolo in
    select con.conname
    from pg_constraint con
    join pg_class rel on rel.oid = con.conrelid
    join pg_namespace nsp on nsp.oid = rel.relnamespace
    where nsp.nspname = 'public'
      and rel.relname = 'haccp_richieste_ingresso'
      and con.contype = 'c'
      and pg_get_constraintdef(con.oid) ilike '%notifica_stato%'
  loop
    execute format(
      'alter table public.haccp_richieste_ingresso drop constraint %I',
      vincolo.conname
    );
  end loop;
end $$;

alter table public.haccp_richieste_ingresso
  add constraint haccp_richieste_ingresso_notifica_check check (
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

create or replace function public.haccp_richieste_ingresso_notifica_lock()
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
    if current_setting('haccp.notifica_ingresso', true) is distinct from '1' then
      raise exception 'La notifica si aggiorna solo con il lock di invio';
    end if;
  end if;
  return new;
end;
$$;

drop trigger if exists haccp_richieste_ingresso_notifica_lock on public.haccp_richieste_ingresso;
create trigger haccp_richieste_ingresso_notifica_lock
  before update on public.haccp_richieste_ingresso
  for each row execute function public.haccp_richieste_ingresso_notifica_lock();

create or replace function public.acquisisci_notifica_richiesta_ingresso(
  p_richiesta_id uuid,
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
  v_lock uuid;
  v_stato text;
  v_lock_at timestamptz;
  v_tentativo integer;
begin
  if not (
    public.is_superadmin()
    or public.has_area_access('amministrazione')
  ) then
    raise exception 'Non autorizzato a inviare la notifica';
  end if;

  perform set_config('haccp.notifica_ingresso', '1', true);

  update public.haccp_richieste_ingresso r
  set
    notifica_stato = 'in_invio',
    notifica_lock = gen_random_uuid(),
    notifica_lock_at = now(),
    notifica_tentativi = r.notifica_tentativi + 1,
    notifica_errore = null,
    notifica_message_id = null,
    updated_by = public.app_effective_uid()
  where r.id = p_richiesta_id
    and r.deleted_at is null
    and r.foglio_id is not null
    and (
      r.notifica_stato in ('non_inviata', 'fallita')
      or (
        p_conferma_incerta
        and r.notifica_stato = 'incerta'
      )
      or (
        p_conferma_incerta
        and r.notifica_stato = 'in_invio'
        and r.notifica_lock_at <= now() - interval '1080 seconds'
      )
    )
  returning r.notifica_lock, r.notifica_stato, r.notifica_lock_at, r.notifica_tentativi
  into v_lock, v_stato, v_lock_at, v_tentativo;

  if found then
    acquisita := true;
    lock_id := v_lock;
    stato := v_stato;
    lock_at := v_lock_at;
    tentativo := v_tentativo;
    return next;
    return;
  end if;

  select r.notifica_lock, r.notifica_stato, r.notifica_lock_at, r.notifica_tentativi
    into v_lock, v_stato, v_lock_at, v_tentativo
  from public.haccp_richieste_ingresso r
  where r.id = p_richiesta_id
    and r.deleted_at is null;

  acquisita := false;
  lock_id := v_lock;
  stato := v_stato;
  lock_at := v_lock_at;
  tentativo := v_tentativo;
  return next;
end;
$$;

comment on function public.acquisisci_notifica_richiesta_ingresso(uuid, boolean) is
  'Un solo UPDATE assegna il lock. Non invia la mail. Non riprende un invio in corso prima di 1080 secondi.';

create or replace function public.concludi_notifica_richiesta_ingresso(
  p_richiesta_id uuid,
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
  v_stato text;
begin
  if not (
    public.is_superadmin()
    or public.has_area_access('amministrazione')
  ) then
    raise exception 'Non autorizzato a concludere la notifica';
  end if;

  if p_esito not in ('inviata', 'fallita', 'incerta') then
    raise exception 'Esito notifica non valido';
  end if;

  perform set_config('haccp.notifica_ingresso', '1', true);

  update public.haccp_richieste_ingresso r
  set
    notifica_stato = p_esito,
    notifica_at = case when p_esito = 'inviata' then now() else null end,
    notifica_errore = nullif(left(coalesce(p_errore, ''), 400), ''),
    notifica_message_id = case
      when p_esito = 'inviata' then nullif(left(coalesce(p_message_id, ''), 200), '')
      else r.notifica_message_id
    end,
    updated_by = public.app_effective_uid()
  where r.id = p_richiesta_id
    and r.deleted_at is null
    and r.notifica_stato = 'in_invio'
    and r.notifica_lock = p_lock
  returning r.notifica_stato
  into v_stato;

  if found then
    aggiornata := true;
    stato := v_stato;
    return next;
    return;
  end if;

  select r.notifica_stato
    into v_stato
  from public.haccp_richieste_ingresso r
  where r.id = p_richiesta_id
    and r.deleted_at is null;

  aggiornata := false;
  stato := v_stato;
  return next;
end;
$$;

comment on function public.concludi_notifica_richiesta_ingresso(uuid, uuid, text, text, text) is
  'Conclude solo il tentativo il cui token è ancora il lock valido e lo stato è in_invio.';

revoke all on function public.acquisisci_notifica_richiesta_ingresso(uuid, boolean) from public, anon;
revoke all on function public.concludi_notifica_richiesta_ingresso(uuid, uuid, text, text, text) from public, anon;
grant execute on function public.acquisisci_notifica_richiesta_ingresso(uuid, boolean) to authenticated;
grant execute on function public.concludi_notifica_richiesta_ingresso(uuid, uuid, text, text, text) to authenticated;

revoke all on function public.haccp_richieste_ingresso_notifica_lock() from public, anon, authenticated;
