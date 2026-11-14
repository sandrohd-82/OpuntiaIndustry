-- Richiesta operativa Materiale in ingresso, collegata al foglio già esistente.
-- La notifica email non è una ricevuta di lettura.

create table if not exists public.haccp_richieste_ingresso (
  id uuid primary key default gen_random_uuid(),
  fornitore_id uuid not null references public.fornitori (id),
  foglio_id uuid references public.haccp_fogli_ingresso (id),
  chiave_operazione uuid not null,
  disponibile_at timestamptz,
  notifica_stato text not null default 'non_inviata'
    check (notifica_stato in ('non_inviata', 'inviata', 'fallita')),
  notifica_at timestamptz,
  notifica_errore text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  created_by uuid,
  updated_by uuid,
  deleted_at timestamptz,
  deleted_by uuid,
  constraint haccp_richieste_ingresso_notifica_check check (
    (notifica_stato = 'inviata' and notifica_at is not null)
    or notifica_stato <> 'inviata'
  ),
  constraint haccp_richieste_ingresso_disponibile_check check (
    disponibile_at is null or foglio_id is not null
  )
);

comment on table public.haccp_richieste_ingresso is
  'Invio di un foglio Materiale in ingresso dalla scheda fornitore. Una chiave crea un solo foglio.';

create unique index if not exists haccp_richieste_ingresso_chiave_uidx
  on public.haccp_richieste_ingresso (chiave_operazione);

create unique index if not exists haccp_richieste_ingresso_foglio_uidx
  on public.haccp_richieste_ingresso (foglio_id)
  where foglio_id is not null and deleted_at is null;

create index if not exists haccp_richieste_ingresso_fornitore_idx
  on public.haccp_richieste_ingresso (fornitore_id)
  where deleted_at is null;

drop trigger if exists haccp_richieste_ingresso_updated_at on public.haccp_richieste_ingresso;
create trigger haccp_richieste_ingresso_updated_at
  before update on public.haccp_richieste_ingresso
  for each row execute function public.set_updated_at();

create or replace function public.haccp_richieste_ingresso_proteggi()
returns trigger
language plpgsql
as $$
begin
  if new.fornitore_id is distinct from old.fornitore_id
     or new.chiave_operazione is distinct from old.chiave_operazione
     or new.created_by is distinct from old.created_by then
    raise exception 'La richiesta non cambia fornitore';
  end if;
  if old.foglio_id is not null and new.foglio_id is distinct from old.foglio_id then
    raise exception 'Il foglio della richiesta non si sostituisce';
  end if;
  return new;
end;
$$;

drop trigger if exists haccp_richieste_ingresso_proteggi on public.haccp_richieste_ingresso;
create trigger haccp_richieste_ingresso_proteggi
  before update on public.haccp_richieste_ingresso
  for each row execute function public.haccp_richieste_ingresso_proteggi();

create or replace function public.crea_richiesta_materiale_ingresso(
  p_fornitore_id uuid,
  p_chiave uuid
)
returns table (
  richiesta_id uuid,
  foglio_id uuid,
  codice text,
  creata boolean
)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_id uuid;
  v_foglio uuid;
  v_codice text;
  v_fornitore uuid;
  v_nuova boolean := false;
begin
  if not (
    public.is_superadmin()
    or public.has_area_access('amministrazione')
  ) then
    raise exception 'Non autorizzato a inviare la richiesta';
  end if;

  select f.id
    into v_fornitore
  from public.fornitori f
  where f.id = p_fornitore_id
    and f.deleted_at is null
    and 'materia_prima' = any (f.tipologie);

  if v_fornitore is null then
    raise exception 'Il fornitore non è idoneo: serve la tipologia Materia prima';
  end if;

  if not exists (
    select 1
    from public.fornitori_accessi a
    join public.profiles p on p.id = a.profile_id
    where a.fornitore_id = p_fornitore_id
      and a.deleted_at is null
      and p.is_active = true
  ) then
    raise exception 'Nessun account attivo collegato a questo fornitore';
  end if;

  insert into public.haccp_richieste_ingresso (
    fornitore_id, chiave_operazione, notifica_stato, created_by, updated_by
  )
  values (
    p_fornitore_id, p_chiave, 'non_inviata', public.app_effective_uid(), public.app_effective_uid()
  )
  on conflict (chiave_operazione) do nothing
  returning id into v_id;

  if v_id is null then
    select r.id, r.foglio_id, g.codice
      into v_id, v_foglio, v_codice
    from public.haccp_richieste_ingresso r
    left join public.haccp_fogli_ingresso g on g.id = r.foglio_id
    where r.chiave_operazione = p_chiave
      and r.deleted_at is null;
    if v_id is null then
      raise exception 'Operazione non disponibile';
    end if;
    if exists (
      select 1
      from public.haccp_richieste_ingresso r
      where r.id = v_id
        and r.fornitore_id is distinct from p_fornitore_id
    ) then
      raise exception 'Operazione già usata per un altro fornitore';
    end if;
    if v_foglio is not null then
      richiesta_id := v_id;
      foglio_id := v_foglio;
      codice := v_codice;
      creata := false;
      return next;
      return;
    end if;
    v_nuova := true;
  else
    v_nuova := true;
  end if;

  v_codice := public.codice_foglio_ingresso();
  insert into public.haccp_fogli_ingresso (
    codice, fornitore_id, stato, opened_by, created_by, updated_by
  )
  values (
    v_codice,
    p_fornitore_id,
    'aperto',
    public.app_effective_uid(),
    public.app_effective_uid(),
    public.app_effective_uid()
  )
  returning id into v_foglio;

  update public.haccp_richieste_ingresso
  set foglio_id = v_foglio,
      disponibile_at = now(),
      updated_by = public.app_effective_uid()
  where id = v_id
    and foglio_id is null;

  richiesta_id := v_id;
  foglio_id := v_foglio;
  codice := v_codice;
  creata := v_nuova;
  return next;
end;
$$;

comment on function public.crea_richiesta_materiale_ingresso(uuid, uuid) is
  'Crea un foglio solo se la chiave è nuova. Non invia la mail.';

revoke all on function public.crea_richiesta_materiale_ingresso(uuid, uuid) from public, anon;
grant execute on function public.crea_richiesta_materiale_ingresso(uuid, uuid) to authenticated;

alter table public.haccp_richieste_ingresso enable row level security;

drop policy if exists "haccp_richieste_ingresso_select" on public.haccp_richieste_ingresso;
create policy "haccp_richieste_ingresso_select"
  on public.haccp_richieste_ingresso for select to authenticated
  using (
    public.is_superadmin()
    or public.has_area_access('amministrazione')
    or public.has_area_access('produzione')
    or (
      fornitore_id = public.fornitore_collegato_id()
      and deleted_at is null
    )
  );

drop policy if exists "haccp_richieste_ingresso_insert" on public.haccp_richieste_ingresso;
create policy "haccp_richieste_ingresso_insert"
  on public.haccp_richieste_ingresso for insert to authenticated
  with check (
    public.is_superadmin()
    or public.has_area_access('amministrazione')
  );

drop policy if exists "haccp_richieste_ingresso_update" on public.haccp_richieste_ingresso;
create policy "haccp_richieste_ingresso_update"
  on public.haccp_richieste_ingresso for update to authenticated
  using (
    public.is_superadmin()
    or public.has_area_access('amministrazione')
  )
  with check (
    public.is_superadmin()
    or public.has_area_access('amministrazione')
  );

grant select, insert, update on public.haccp_richieste_ingresso to authenticated;
revoke delete on public.haccp_richieste_ingresso from authenticated, anon;
revoke all on public.haccp_richieste_ingresso from anon;

-- Il foglio nuovo nasce solo dalla funzione di invio. I fogli già aperti restano.
revoke insert on public.haccp_fogli_ingresso from authenticated, anon;

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
      or public.has_area_access('amministrazione')
    )
  );
