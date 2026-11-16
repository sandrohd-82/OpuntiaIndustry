-- Requisiti documentali di abilitazione fornitore.
-- Non tocca gli ordini, le 22 voci, le distribuzioni HACCP già registrate
-- né i flussi privacy e contratto dei clienti.

create table if not exists public.fornitori_requisiti (
  id uuid primary key default gen_random_uuid(),
  codice text not null,
  titolo text not null,
  natura text not null
    check (natura in (
      'presa_visione',
      'consenso_privacy',
      'accettazione_contrattuale',
      'controllo_interno'
    )),
  linea_guida_id uuid references public.haccp_linee_guida (id),
  validita_giorni integer,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  created_by uuid,
  updated_by uuid,
  deleted_at timestamptz,
  deleted_by uuid,
  constraint fornitori_requisiti_validita_check check (
    validita_giorni is null or validita_giorni > 0
  ),
  constraint fornitori_requisiti_origine_check check (
    (natura = 'presa_visione' and linea_guida_id is not null)
    or (natura <> 'presa_visione' and linea_guida_id is null)
  )
);

comment on table public.fornitori_requisiti is
  'Catalogo dei requisiti di abilitazione. La presa visione punta a una linea guida esistente. Non è una firma.';

create unique index if not exists fornitori_requisiti_codice_uidx
  on public.fornitori_requisiti (codice)
  where deleted_at is null;

drop trigger if exists fornitori_requisiti_updated_at on public.fornitori_requisiti;
create trigger fornitori_requisiti_updated_at
  before update on public.fornitori_requisiti
  for each row execute function public.set_updated_at();

create table if not exists public.fornitori_requisiti_tipologie (
  requisito_id uuid not null references public.fornitori_requisiti (id),
  tipologia text not null
    check (tipologia in ('servizio', 'prodotto', 'materia_prima', 'contributo')),
  primary key (requisito_id, tipologia)
);

create table if not exists public.fornitori_requisiti_eccezioni (
  id uuid primary key default gen_random_uuid(),
  requisito_id uuid not null references public.fornitori_requisiti (id),
  fornitore_id uuid not null references public.fornitori (id),
  modalita text not null check (modalita in ('aggiunto', 'escluso')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  created_by uuid,
  updated_by uuid,
  deleted_at timestamptz,
  deleted_by uuid
);

create unique index if not exists fornitori_requisiti_eccezioni_uidx
  on public.fornitori_requisiti_eccezioni (requisito_id, fornitore_id)
  where deleted_at is null;

drop trigger if exists fornitori_requisiti_eccezioni_updated_at on public.fornitori_requisiti_eccezioni;
create trigger fornitori_requisiti_eccezioni_updated_at
  before update on public.fornitori_requisiti_eccezioni
  for each row execute function public.set_updated_at();

create table if not exists public.fornitori_testi_abilitazione (
  id uuid primary key default gen_random_uuid(),
  requisito_id uuid not null references public.fornitori_requisiti (id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  created_by uuid,
  updated_by uuid,
  deleted_at timestamptz,
  deleted_by uuid
);

create unique index if not exists fornitori_testi_abilitazione_requisito_uidx
  on public.fornitori_testi_abilitazione (requisito_id)
  where deleted_at is null;

comment on table public.fornitori_testi_abilitazione is
  'Testo di consenso privacy o accettazione contrattuale del fornitore. Non è il documento del cliente e non è una linea guida.';

create table if not exists public.fornitori_testi_versioni (
  id uuid primary key default gen_random_uuid(),
  testo_id uuid not null references public.fornitori_testi_abilitazione (id),
  numero integer not null check (numero > 0),
  titolo text not null,
  corpo text not null default '',
  stato text not null default 'bozza' check (stato in ('bozza', 'pubblicata')),
  pubblicata_at timestamptz,
  pubblicata_by uuid,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  created_by uuid,
  updated_by uuid,
  deleted_at timestamptz,
  deleted_by uuid,
  constraint fornitori_testi_versioni_pubblicazione_check check (
    (stato = 'bozza' and pubblicata_at is null)
    or (stato = 'pubblicata' and pubblicata_at is not null)
  )
);

create unique index if not exists fornitori_testi_versioni_numero_uidx
  on public.fornitori_testi_versioni (testo_id, numero)
  where deleted_at is null;

create unique index if not exists fornitori_testi_versioni_bozza_uidx
  on public.fornitori_testi_versioni (testo_id)
  where stato = 'bozza' and deleted_at is null;

drop trigger if exists fornitori_testi_versioni_updated_at on public.fornitori_testi_versioni;
create trigger fornitori_testi_versioni_updated_at
  before update on public.fornitori_testi_versioni
  for each row execute function public.set_updated_at();

create or replace function public.fornitori_testi_versioni_proteggi()
returns trigger
language plpgsql
as $$
begin
  if tg_op = 'DELETE' then
    if old.stato = 'pubblicata' then
      raise exception 'La versione pubblicata non si elimina';
    end if;
    return old;
  end if;
  if old.stato = 'pubblicata' then
    raise exception 'La versione pubblicata è immutabile';
  end if;
  return new;
end;
$$;

drop trigger if exists fornitori_testi_versioni_proteggi on public.fornitori_testi_versioni;
create trigger fornitori_testi_versioni_proteggi
  before update or delete on public.fornitori_testi_versioni
  for each row execute function public.fornitori_testi_versioni_proteggi();

create table if not exists public.fornitori_testi_distribuzioni (
  id uuid primary key default gen_random_uuid(),
  testo_id uuid not null references public.fornitori_testi_abilitazione (id),
  versione_id uuid not null references public.fornitori_testi_versioni (id),
  fornitore_id uuid not null references public.fornitori (id),
  registrata_at timestamptz not null default now(),
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
  constraint fornitori_testi_distribuzioni_notifica_check check (
    (notifica_stato = 'inviata' and notifica_at is not null)
    or notifica_stato <> 'inviata'
  )
);

comment on table public.fornitori_testi_distribuzioni is
  'Una versione per fornitore. La mail è un avviso: inviata non significa letta.';

create unique index if not exists fornitori_testi_distribuzioni_uidx
  on public.fornitori_testi_distribuzioni (versione_id, fornitore_id)
  where deleted_at is null;

drop trigger if exists fornitori_testi_distribuzioni_updated_at on public.fornitori_testi_distribuzioni;
create trigger fornitori_testi_distribuzioni_updated_at
  before update on public.fornitori_testi_distribuzioni
  for each row execute function public.set_updated_at();

create table if not exists public.fornitori_testi_atti (
  id uuid primary key default gen_random_uuid(),
  fornitore_id uuid not null references public.fornitori (id),
  profile_id uuid not null references public.profiles (id),
  testo_id uuid not null references public.fornitori_testi_abilitazione (id),
  versione_id uuid not null references public.fornitori_testi_versioni (id),
  atto text not null
    check (atto in ('consenso_privacy', 'accettazione_contrattuale')),
  confermata_at timestamptz not null default now(),
  created_at timestamptz not null default now(),
  created_by uuid
);

comment on table public.fornitori_testi_atti is
  'Consenso privacy o accettazione contrattuale autenticati, sulla versione precisa. Non sono presa visione né firma qualificata.';

create unique index if not exists fornitori_testi_atti_uidx
  on public.fornitori_testi_atti (profile_id, versione_id);

create table if not exists public.fornitori_controlli_interni (
  id uuid primary key default gen_random_uuid(),
  requisito_id uuid not null references public.fornitori_requisiti (id),
  fornitore_id uuid not null references public.fornitori (id),
  esito text not null check (esito in ('conforme', 'non_conforme')),
  nota text not null,
  registrata_at timestamptz not null default now(),
  created_at timestamptz not null default now(),
  created_by uuid,
  constraint fornitori_controlli_interni_nota_check check (char_length(nota) >= 3)
);

comment on table public.fornitori_controlli_interni is
  'Controlli interni append-only. Una nuova riga non cancella le precedenti.';

create table if not exists public.fornitori_abilitazione_eventi (
  id uuid primary key default gen_random_uuid(),
  fornitore_id uuid not null references public.fornitori (id),
  tipo text not null check (tipo in ('sospensione', 'riabilitazione')),
  motivo text not null,
  created_at timestamptz not null default now(),
  created_by uuid,
  constraint fornitori_abilitazione_eventi_motivo_check check (char_length(motivo) >= 3)
);

comment on table public.fornitori_abilitazione_eventi is
  'Sospensione e riabilitazione in storico. Lo stato corrente è l''ultimo evento.';

alter table public.fornitori_requisiti enable row level security;
alter table public.fornitori_requisiti_tipologie enable row level security;
alter table public.fornitori_requisiti_eccezioni enable row level security;
alter table public.fornitori_testi_abilitazione enable row level security;
alter table public.fornitori_testi_versioni enable row level security;
alter table public.fornitori_testi_distribuzioni enable row level security;
alter table public.fornitori_testi_atti enable row level security;
alter table public.fornitori_controlli_interni enable row level security;
alter table public.fornitori_abilitazione_eventi enable row level security;

create or replace function public.fornitore_requisito_staff()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select public.is_superadmin()
    or public.has_area_access('amministrazione')
    or public.has_area_access('produzione');
$$;

create or replace function public.fornitore_requisito_scrive()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select public.is_superadmin()
    or public.has_area_access('amministrazione');
$$;

revoke all on function public.fornitore_requisito_staff() from public, anon;
revoke all on function public.fornitore_requisito_scrive() from public, anon;
grant execute on function public.fornitore_requisito_staff() to authenticated;
grant execute on function public.fornitore_requisito_scrive() to authenticated;

drop policy if exists "fornitori_requisiti_select" on public.fornitori_requisiti;
create policy "fornitori_requisiti_select"
  on public.fornitori_requisiti for select to authenticated
  using (
    public.fornitore_requisito_staff()
    or (
      deleted_at is null
      and exists (
        select 1
        from public.fornitori_testi_abilitazione t
        join public.fornitori_testi_distribuzioni d on d.testo_id = t.id
        where t.requisito_id = fornitori_requisiti.id
          and t.deleted_at is null
          and d.fornitore_id = public.fornitore_collegato_id()
          and d.deleted_at is null
      )
    )
  );

drop policy if exists "fornitori_requisiti_insert" on public.fornitori_requisiti;
create policy "fornitori_requisiti_insert"
  on public.fornitori_requisiti for insert to authenticated
  with check (public.fornitore_requisito_scrive());

drop policy if exists "fornitori_requisiti_update" on public.fornitori_requisiti;
create policy "fornitori_requisiti_update"
  on public.fornitori_requisiti for update to authenticated
  using (public.fornitore_requisito_scrive())
  with check (public.fornitore_requisito_scrive());

drop policy if exists "fornitori_requisiti_tipologie_select" on public.fornitori_requisiti_tipologie;
create policy "fornitori_requisiti_tipologie_select"
  on public.fornitori_requisiti_tipologie for select to authenticated
  using (public.fornitore_requisito_staff());

drop policy if exists "fornitori_requisiti_tipologie_insert" on public.fornitori_requisiti_tipologie;
create policy "fornitori_requisiti_tipologie_insert"
  on public.fornitori_requisiti_tipologie for insert to authenticated
  with check (public.fornitore_requisito_scrive());

drop policy if exists "fornitori_requisiti_eccezioni_select" on public.fornitori_requisiti_eccezioni;
create policy "fornitori_requisiti_eccezioni_select"
  on public.fornitori_requisiti_eccezioni for select to authenticated
  using (
    public.fornitore_requisito_staff()
    or (
      fornitore_id = public.fornitore_collegato_id()
      and deleted_at is null
    )
  );

drop policy if exists "fornitori_requisiti_eccezioni_insert" on public.fornitori_requisiti_eccezioni;
create policy "fornitori_requisiti_eccezioni_insert"
  on public.fornitori_requisiti_eccezioni for insert to authenticated
  with check (public.fornitore_requisito_scrive());

drop policy if exists "fornitori_requisiti_eccezioni_update" on public.fornitori_requisiti_eccezioni;
create policy "fornitori_requisiti_eccezioni_update"
  on public.fornitori_requisiti_eccezioni for update to authenticated
  using (public.fornitore_requisito_scrive())
  with check (public.fornitore_requisito_scrive());

drop policy if exists "fornitori_testi_abilitazione_select" on public.fornitori_testi_abilitazione;
create policy "fornitori_testi_abilitazione_select"
  on public.fornitori_testi_abilitazione for select to authenticated
  using (
    public.fornitore_requisito_staff()
    or exists (
      select 1
      from public.fornitori_testi_distribuzioni d
      where d.testo_id = fornitori_testi_abilitazione.id
        and d.fornitore_id = public.fornitore_collegato_id()
        and d.deleted_at is null
    )
  );

drop policy if exists "fornitori_testi_abilitazione_insert" on public.fornitori_testi_abilitazione;
create policy "fornitori_testi_abilitazione_insert"
  on public.fornitori_testi_abilitazione for insert to authenticated
  with check (public.fornitore_requisito_scrive());

drop policy if exists "fornitori_testi_versioni_select" on public.fornitori_testi_versioni;
create policy "fornitori_testi_versioni_select"
  on public.fornitori_testi_versioni for select to authenticated
  using (
    public.fornitore_requisito_staff()
    or (
      stato = 'pubblicata'
      and deleted_at is null
      and exists (
        select 1
        from public.fornitori_testi_distribuzioni d
        where d.versione_id = fornitori_testi_versioni.id
          and d.fornitore_id = public.fornitore_collegato_id()
          and d.deleted_at is null
      )
    )
  );

drop policy if exists "fornitori_testi_versioni_insert" on public.fornitori_testi_versioni;
create policy "fornitori_testi_versioni_insert"
  on public.fornitori_testi_versioni for insert to authenticated
  with check (public.fornitore_requisito_scrive() and stato = 'bozza');

drop policy if exists "fornitori_testi_versioni_update" on public.fornitori_testi_versioni;
create policy "fornitori_testi_versioni_update"
  on public.fornitori_testi_versioni for update to authenticated
  using (public.fornitore_requisito_scrive())
  with check (public.fornitore_requisito_scrive());

drop policy if exists "fornitori_testi_distribuzioni_select" on public.fornitori_testi_distribuzioni;
create policy "fornitori_testi_distribuzioni_select"
  on public.fornitori_testi_distribuzioni for select to authenticated
  using (
    public.fornitore_requisito_staff()
    or (
      fornitore_id = public.fornitore_collegato_id()
      and deleted_at is null
    )
  );

drop policy if exists "fornitori_testi_distribuzioni_insert" on public.fornitori_testi_distribuzioni;
create policy "fornitori_testi_distribuzioni_insert"
  on public.fornitori_testi_distribuzioni for insert to authenticated
  with check (public.fornitore_requisito_scrive());

drop policy if exists "fornitori_testi_distribuzioni_update" on public.fornitori_testi_distribuzioni;
create policy "fornitori_testi_distribuzioni_update"
  on public.fornitori_testi_distribuzioni for update to authenticated
  using (public.fornitore_requisito_scrive())
  with check (public.fornitore_requisito_scrive());

drop policy if exists "fornitori_testi_atti_select" on public.fornitori_testi_atti;
create policy "fornitori_testi_atti_select"
  on public.fornitori_testi_atti for select to authenticated
  using (
    public.fornitore_requisito_staff()
    or fornitore_id = public.fornitore_collegato_id()
  );

drop policy if exists "fornitori_testi_atti_insert" on public.fornitori_testi_atti;
create policy "fornitori_testi_atti_insert"
  on public.fornitori_testi_atti for insert to authenticated
  with check (
    profile_id = public.app_effective_uid()
    and created_by = public.app_effective_uid()
    and fornitore_id = public.fornitore_collegato_id()
    and exists (
      select 1
      from public.fornitori_testi_distribuzioni d
      join public.fornitori_testi_versioni v on v.id = d.versione_id
      join public.fornitori_testi_abilitazione t on t.id = d.testo_id
      join public.fornitori_requisiti r on r.id = t.requisito_id
      where d.versione_id = fornitori_testi_atti.versione_id
        and d.testo_id = fornitori_testi_atti.testo_id
        and d.fornitore_id = fornitori_testi_atti.fornitore_id
        and d.deleted_at is null
        and v.stato = 'pubblicata'
        and v.deleted_at is null
        and r.natura = fornitori_testi_atti.atto
        and r.deleted_at is null
    )
  );

drop policy if exists "fornitori_controlli_interni_select" on public.fornitori_controlli_interni;
create policy "fornitori_controlli_interni_select"
  on public.fornitori_controlli_interni for select to authenticated
  using (public.fornitore_requisito_staff());

drop policy if exists "fornitori_controlli_interni_insert" on public.fornitori_controlli_interni;
create policy "fornitori_controlli_interni_insert"
  on public.fornitori_controlli_interni for insert to authenticated
  with check (public.fornitore_requisito_scrive());

drop policy if exists "fornitori_abilitazione_eventi_select" on public.fornitori_abilitazione_eventi;
create policy "fornitori_abilitazione_eventi_select"
  on public.fornitori_abilitazione_eventi for select to authenticated
  using (public.fornitore_requisito_staff());

drop policy if exists "fornitori_abilitazione_eventi_insert" on public.fornitori_abilitazione_eventi;
create policy "fornitori_abilitazione_eventi_insert"
  on public.fornitori_abilitazione_eventi for insert to authenticated
  with check (public.fornitore_requisito_scrive());

grant select, insert, update on public.fornitori_requisiti to authenticated;
grant select, insert on public.fornitori_requisiti_tipologie to authenticated;
grant select, insert, update on public.fornitori_requisiti_eccezioni to authenticated;
grant select, insert, update on public.fornitori_testi_abilitazione to authenticated;
grant select, insert, update on public.fornitori_testi_versioni to authenticated;
grant select, insert, update on public.fornitori_testi_distribuzioni to authenticated;
grant select, insert on public.fornitori_testi_atti to authenticated;
grant select, insert on public.fornitori_controlli_interni to authenticated;
grant select, insert on public.fornitori_abilitazione_eventi to authenticated;

revoke delete on public.fornitori_requisiti from authenticated, anon;
revoke delete on public.fornitori_requisiti_tipologie from authenticated, anon;
revoke delete on public.fornitori_requisiti_eccezioni from authenticated, anon;
revoke delete on public.fornitori_testi_abilitazione from authenticated, anon;
revoke delete on public.fornitori_testi_versioni from authenticated, anon;
revoke delete on public.fornitori_testi_distribuzioni from authenticated, anon;
revoke update, delete on public.fornitori_testi_atti from authenticated, anon;
revoke update, delete on public.fornitori_controlli_interni from authenticated, anon;
revoke update, delete on public.fornitori_abilitazione_eventi from authenticated, anon;

revoke all on public.fornitori_requisiti from anon;
revoke all on public.fornitori_requisiti_tipologie from anon;
revoke all on public.fornitori_requisiti_eccezioni from anon;
revoke all on public.fornitori_testi_abilitazione from anon;
revoke all on public.fornitori_testi_versioni from anon;
revoke all on public.fornitori_testi_distribuzioni from anon;
revoke all on public.fornitori_testi_atti from anon;
revoke all on public.fornitori_controlli_interni from anon;
revoke all on public.fornitori_abilitazione_eventi from anon;
