-- Foglio operativo Materiale in ingresso: un solo registro per carico.
-- Foto, DDT, OTP, partenza, arrivo e chiusura non sono ancora eseguibili.

create sequence if not exists public.haccp_fogli_ingresso_seq;

create table if not exists public.haccp_fogli_ingresso (
  id uuid primary key default gen_random_uuid(),
  codice text not null unique,
  fornitore_id uuid not null references public.fornitori (id),
  stato text not null default 'aperto'
    check (stato in ('aperto', 'in_compilazione', 'in_attesa', 'partito', 'arrivato', 'chiuso')),
  opened_at timestamptz not null default now(),
  opened_by uuid,
  arrived_at timestamptz,
  arrived_by uuid,
  closed_at timestamptz,
  closed_by uuid,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  created_by uuid,
  updated_by uuid,
  deleted_at timestamptz,
  deleted_by uuid
);

comment on table public.haccp_fogli_ingresso is
  'Un foglio per carico, condiviso tra Produzione e Gestionale fornitori.';

create index if not exists haccp_fogli_ingresso_fornitore_idx
  on public.haccp_fogli_ingresso (fornitore_id)
  where deleted_at is null;

drop trigger if exists haccp_fogli_ingresso_updated_at on public.haccp_fogli_ingresso;
create trigger haccp_fogli_ingresso_updated_at
  before update on public.haccp_fogli_ingresso
  for each row execute function public.set_updated_at();

create or replace function public.codice_foglio_ingresso()
returns text
language plpgsql
as $$
begin
  return 'MI-'
    || to_char(now() at time zone 'Europe/Rome', 'YY')
    || '-'
    || lpad(nextval('public.haccp_fogli_ingresso_seq')::text, 4, '0');
end;
$$;

revoke all on function public.codice_foglio_ingresso() from public, anon;
grant execute on function public.codice_foglio_ingresso() to authenticated;
grant usage, select on sequence public.haccp_fogli_ingresso_seq to authenticated;

alter table public.haccp_fogli_ingresso
  alter column codice set default public.codice_foglio_ingresso();

create table if not exists public.haccp_fogli_ingresso_linee (
  id uuid primary key default gen_random_uuid(),
  foglio_id uuid not null references public.haccp_fogli_ingresso (id),
  documento_id uuid not null references public.haccp_linee_guida (id),
  versione_id uuid not null references public.haccp_linee_guida_versioni (id),
  created_at timestamptz not null default now(),
  created_by uuid,
  unique (foglio_id, versione_id)
);

comment on table public.haccp_fogli_ingresso_linee is
  'Versioni delle linee guida applicabili all''apertura. Il testo resta nella versione, non si copia nel foglio.';

create table if not exists public.haccp_fogli_ingresso_risposte (
  id uuid primary key default gen_random_uuid(),
  foglio_id uuid not null references public.haccp_fogli_ingresso (id),
  voce_codice text not null,
  valore jsonb not null,
  motivazione text,
  confermata_at timestamptz not null default now(),
  confermata_by uuid not null,
  created_at timestamptz not null default now(),
  created_by uuid not null
);

comment on table public.haccp_fogli_ingresso_risposte is
  'Storico append-only. Una correzione è una riga nuova, con motivazione.';

create index if not exists haccp_fogli_ingresso_risposte_voce_idx
  on public.haccp_fogli_ingresso_risposte (foglio_id, voce_codice, confermata_at desc);

create table if not exists public.haccp_fogli_ingresso_eventi (
  id uuid primary key default gen_random_uuid(),
  foglio_id uuid not null references public.haccp_fogli_ingresso (id),
  da_stato text,
  a_stato text not null,
  nota text,
  created_at timestamptz not null default now(),
  created_by uuid
);

comment on table public.haccp_fogli_ingresso_eventi is
  'Passaggi di stato del foglio. Non si cancellano.';

create or replace function public.haccp_foglio_ingresso_proteggi()
returns trigger
language plpgsql
as $$
begin
  if new.fornitore_id is distinct from old.fornitore_id
     or new.codice is distinct from old.codice
     or new.opened_at is distinct from old.opened_at
     or new.opened_by is distinct from old.opened_by
     or new.created_by is distinct from old.created_by
     or new.arrived_at is distinct from old.arrived_at
     or new.arrived_by is distinct from old.arrived_by
     or new.closed_at is distinct from old.closed_at
     or new.closed_by is distinct from old.closed_by
  then
    raise exception 'Il fornitore e la chiusura del foglio non si modificano da qui';
  end if;

  if new.stato is distinct from old.stato then
    if new.stato in ('partito', 'arrivato', 'chiuso')
       or old.stato in ('partito', 'arrivato', 'chiuso') then
      raise exception 'Transizione non disponibile: foto, DDT e firme OTP non sono attive';
    end if;
    if not (
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

drop trigger if exists haccp_foglio_ingresso_proteggi on public.haccp_fogli_ingresso;
create trigger haccp_foglio_ingresso_proteggi
  before update on public.haccp_fogli_ingresso
  for each row execute function public.haccp_foglio_ingresso_proteggi();

create or replace function public.haccp_foglio_ingresso_evento()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if tg_op = 'INSERT' then
    insert into public.haccp_fogli_ingresso_eventi (foglio_id, da_stato, a_stato, nota, created_by)
    values (new.id, null, new.stato, 'Apertura', new.created_by);
    return new;
  end if;
  if new.stato is distinct from old.stato then
    insert into public.haccp_fogli_ingresso_eventi (foglio_id, da_stato, a_stato, created_by)
    values (new.id, old.stato, new.stato, new.updated_by);
  end if;
  return new;
end;
$$;

drop trigger if exists haccp_foglio_ingresso_evento on public.haccp_fogli_ingresso;
create trigger haccp_foglio_ingresso_evento
  after insert or update on public.haccp_fogli_ingresso
  for each row execute function public.haccp_foglio_ingresso_evento();

create or replace function public.haccp_foglio_ingresso_applica_linee()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.haccp_fogli_ingresso_linee (foglio_id, documento_id, versione_id, created_by)
  select new.id, src.documento_id, src.versione_id, new.created_by
  from (
    select distinct on (dist.documento_id)
      dist.documento_id,
      dist.versione_id
    from public.haccp_linee_guida_distribuzioni dist
    join public.haccp_linee_guida_versioni ver on ver.id = dist.versione_id
    where dist.fornitore_id = new.fornitore_id
      and dist.deleted_at is null
      and dist.stato = 'registrata'
      and ver.deleted_at is null
      and ver.stato = 'pubblicata'
    order by dist.documento_id, ver.numero desc
  ) src;
  return new;
end;
$$;

drop trigger if exists haccp_foglio_ingresso_applica_linee on public.haccp_fogli_ingresso;
create trigger haccp_foglio_ingresso_applica_linee
  after insert on public.haccp_fogli_ingresso
  for each row execute function public.haccp_foglio_ingresso_applica_linee();

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
  if v_stato not in ('aperto', 'in_compilazione') then
    raise exception 'Il foglio non è in compilazione';
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
    'mezzo', '1c', '1d', '1e', '2a', '2b', '2c', '2d', '2e', '2g', '2h', '2i', '2l'
  ) then
    raise exception 'Questa voce non è compilabile';
  end if;

  if not v_interno and exists (
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
  if v_interno and not v_precedente then
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
  end if;

  return new;
end;
$$;

drop trigger if exists haccp_foglio_risposta_valida on public.haccp_fogli_ingresso_risposte;
create trigger haccp_foglio_risposta_valida
  before insert on public.haccp_fogli_ingresso_risposte
  for each row execute function public.haccp_foglio_risposta_valida();

create or replace function public.haccp_foglio_risposta_promuovi()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  update public.haccp_fogli_ingresso
  set stato = 'in_compilazione',
      updated_by = new.created_by
  where id = new.foglio_id
    and stato = 'aperto'
    and deleted_at is null;
  return new;
end;
$$;

drop trigger if exists haccp_foglio_risposta_promuovi on public.haccp_fogli_ingresso_risposte;
create trigger haccp_foglio_risposta_promuovi
  after insert on public.haccp_fogli_ingresso_risposte
  for each row execute function public.haccp_foglio_risposta_promuovi();

alter table public.haccp_fogli_ingresso enable row level security;
alter table public.haccp_fogli_ingresso_linee enable row level security;
alter table public.haccp_fogli_ingresso_risposte enable row level security;
alter table public.haccp_fogli_ingresso_eventi enable row level security;

drop policy if exists "haccp_fogli_ingresso_select" on public.haccp_fogli_ingresso;
create policy "haccp_fogli_ingresso_select"
  on public.haccp_fogli_ingresso for select to authenticated
  using (
    public.is_superadmin()
    or public.has_area_access('produzione')
    or public.has_area_access('amministrazione')
    or (
      fornitore_id = public.fornitore_collegato_id()
      and deleted_at is null
    )
  );

drop policy if exists "haccp_fogli_ingresso_insert" on public.haccp_fogli_ingresso;
create policy "haccp_fogli_ingresso_insert"
  on public.haccp_fogli_ingresso for insert to authenticated
  with check (
    deleted_at is null
    and stato = 'aperto'
    and created_by = public.app_effective_uid()
    and opened_by = public.app_effective_uid()
    and arrived_at is null
    and closed_at is null
    and (
      public.is_superadmin()
      or public.has_area_access('produzione')
      or public.has_area_access('amministrazione')
      or (
        public.has_area_access('area-fornitori')
        and fornitore_id = public.fornitore_collegato_id()
      )
    )
  );

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
      and stato in ('aperto', 'in_compilazione', 'in_attesa')
    )
  );

drop policy if exists "haccp_fogli_ingresso_linee_select" on public.haccp_fogli_ingresso_linee;
create policy "haccp_fogli_ingresso_linee_select"
  on public.haccp_fogli_ingresso_linee for select to authenticated
  using (
    exists (
      select 1 from public.haccp_fogli_ingresso f
      where f.id = foglio_id
        and (
          public.is_superadmin()
          or public.has_area_access('produzione')
          or public.has_area_access('amministrazione')
          or f.fornitore_id = public.fornitore_collegato_id()
        )
    )
  );

drop policy if exists "haccp_fogli_ingresso_risposte_select" on public.haccp_fogli_ingresso_risposte;
create policy "haccp_fogli_ingresso_risposte_select"
  on public.haccp_fogli_ingresso_risposte for select to authenticated
  using (
    exists (
      select 1 from public.haccp_fogli_ingresso f
      where f.id = foglio_id
        and (
          public.is_superadmin()
          or public.has_area_access('produzione')
          or public.has_area_access('amministrazione')
          or f.fornitore_id = public.fornitore_collegato_id()
        )
    )
  );

drop policy if exists "haccp_fogli_ingresso_risposte_insert" on public.haccp_fogli_ingresso_risposte;
create policy "haccp_fogli_ingresso_risposte_insert"
  on public.haccp_fogli_ingresso_risposte for insert to authenticated
  with check (
    created_by = public.app_effective_uid()
    and confermata_by = public.app_effective_uid()
    and voce_codice <> 'q'
    and exists (
      select 1 from public.haccp_fogli_ingresso f
      where f.id = foglio_id
        and f.deleted_at is null
        and f.stato in ('aperto', 'in_compilazione')
        and (
          public.is_superadmin()
          or public.has_area_access('produzione')
          or public.has_area_access('amministrazione')
          or f.fornitore_id = public.fornitore_collegato_id()
        )
    )
  );

drop policy if exists "haccp_fogli_ingresso_eventi_select" on public.haccp_fogli_ingresso_eventi;
create policy "haccp_fogli_ingresso_eventi_select"
  on public.haccp_fogli_ingresso_eventi for select to authenticated
  using (
    exists (
      select 1 from public.haccp_fogli_ingresso f
      where f.id = foglio_id
        and (
          public.is_superadmin()
          or public.has_area_access('produzione')
          or public.has_area_access('amministrazione')
          or f.fornitore_id = public.fornitore_collegato_id()
        )
    )
  );

grant select, insert, update on public.haccp_fogli_ingresso to authenticated;
grant select on public.haccp_fogli_ingresso_linee to authenticated;
grant select, insert on public.haccp_fogli_ingresso_risposte to authenticated;
grant select on public.haccp_fogli_ingresso_eventi to authenticated;

revoke delete on public.haccp_fogli_ingresso from authenticated, anon;
revoke insert, update, delete on public.haccp_fogli_ingresso_linee from authenticated, anon;
revoke update, delete on public.haccp_fogli_ingresso_risposte from authenticated, anon;
revoke insert, update, delete on public.haccp_fogli_ingresso_eventi from authenticated, anon;
revoke all on public.haccp_fogli_ingresso from anon;
revoke all on public.haccp_fogli_ingresso_linee from anon;
revoke all on public.haccp_fogli_ingresso_risposte from anon;
revoke all on public.haccp_fogli_ingresso_eventi from anon;
