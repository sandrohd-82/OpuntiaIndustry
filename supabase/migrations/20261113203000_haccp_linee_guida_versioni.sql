-- Linee guida HACCP: versioni immutabili, destinatari e presa visione.
-- La tabella haccp_linee_guida resta l'identità del documento. Il testo pubblicato
-- vive nello storico e non viene più sovrascritto.

alter table public.haccp_linee_guida
  add column if not exists ambito text not null default 'interno';

alter table public.haccp_linee_guida
  drop constraint if exists haccp_linee_guida_ambito_check;

alter table public.haccp_linee_guida
  add constraint haccp_linee_guida_ambito_check
  check (ambito in ('interno', 'fornitori'));

comment on column public.haccp_linee_guida.ambito is
  'interno: solo Agrinsicilia. fornitori: distribuibile ai destinatari scelti, mai a tutti in automatico.';

create table if not exists public.haccp_linee_guida_versioni (
  id uuid primary key default gen_random_uuid(),
  documento_id uuid not null references public.haccp_linee_guida (id),
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
  constraint haccp_linee_guida_versioni_pubblicazione_check check (
    (stato = 'bozza' and pubblicata_at is null)
    or (stato = 'pubblicata' and pubblicata_at is not null)
  )
);

comment on table public.haccp_linee_guida_versioni is
  'Storico delle linee guida. La bozza è modificabile. La versione pubblicata è immutabile.';

create unique index if not exists haccp_linee_guida_versioni_numero_uidx
  on public.haccp_linee_guida_versioni (documento_id, numero)
  where deleted_at is null;

create unique index if not exists haccp_linee_guida_versioni_bozza_uidx
  on public.haccp_linee_guida_versioni (documento_id)
  where stato = 'bozza' and deleted_at is null;

drop trigger if exists haccp_linee_guida_versioni_updated_at on public.haccp_linee_guida_versioni;
create trigger haccp_linee_guida_versioni_updated_at
  before update on public.haccp_linee_guida_versioni
  for each row execute function public.set_updated_at();

create table if not exists public.haccp_linee_guida_destinatari (
  id uuid primary key default gen_random_uuid(),
  documento_id uuid not null references public.haccp_linee_guida (id),
  fornitore_id uuid not null references public.fornitori (id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  created_by uuid,
  updated_by uuid,
  deleted_at timestamptz,
  deleted_by uuid
);

comment on table public.haccp_linee_guida_destinatari is
  'Fornitori scelti da Agrinsicilia per un documento. Non è l''elenco di tutti i fornitori.';

create unique index if not exists haccp_linee_guida_destinatari_uidx
  on public.haccp_linee_guida_destinatari (documento_id, fornitore_id)
  where deleted_at is null;

drop trigger if exists haccp_linee_guida_destinatari_updated_at on public.haccp_linee_guida_destinatari;
create trigger haccp_linee_guida_destinatari_updated_at
  before update on public.haccp_linee_guida_destinatari
  for each row execute function public.set_updated_at();

create table if not exists public.haccp_linee_guida_distribuzioni (
  id uuid primary key default gen_random_uuid(),
  documento_id uuid not null references public.haccp_linee_guida (id),
  versione_id uuid not null references public.haccp_linee_guida_versioni (id),
  fornitore_id uuid not null references public.fornitori (id),
  registrata_at timestamptz not null default now(),
  stato text not null default 'registrata' check (stato in ('registrata', 'annullata')),
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
  constraint haccp_linee_guida_distribuzioni_notifica_check check (
    (notifica_stato = 'inviata' and notifica_at is not null)
    or notifica_stato <> 'inviata'
  )
);

comment on table public.haccp_linee_guida_distribuzioni is
  'Una versione viene registrata una sola volta per fornitore. La notifica email è un esito separato: fallita non significa consegnata.';

create unique index if not exists haccp_linee_guida_distribuzioni_uidx
  on public.haccp_linee_guida_distribuzioni (versione_id, fornitore_id)
  where deleted_at is null;

create index if not exists haccp_linee_guida_distribuzioni_fornitore_idx
  on public.haccp_linee_guida_distribuzioni (fornitore_id)
  where deleted_at is null and stato = 'registrata';

drop trigger if exists haccp_linee_guida_distribuzioni_updated_at on public.haccp_linee_guida_distribuzioni;
create trigger haccp_linee_guida_distribuzioni_updated_at
  before update on public.haccp_linee_guida_distribuzioni
  for each row execute function public.set_updated_at();

create table if not exists public.haccp_linee_guida_prese_visione (
  id uuid primary key default gen_random_uuid(),
  fornitore_id uuid not null references public.fornitori (id),
  profile_id uuid not null references public.profiles (id),
  documento_id uuid not null references public.haccp_linee_guida (id),
  versione_id uuid not null references public.haccp_linee_guida_versioni (id),
  confermata_at timestamptz not null default now(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  created_by uuid,
  updated_by uuid
);

comment on table public.haccp_linee_guida_prese_visione is
  'Presa visione autenticata di una versione precisa, attribuita alla persona. Non è una firma elettronica qualificata né una rappresentanza legale.';

create unique index if not exists haccp_linee_guida_prese_visione_uidx
  on public.haccp_linee_guida_prese_visione (profile_id, versione_id);

create index if not exists haccp_linee_guida_prese_visione_fornitore_idx
  on public.haccp_linee_guida_prese_visione (fornitore_id, versione_id);

-- Le righe già presenti diventano la versione storica corrente, senza invii.
insert into public.haccp_linee_guida_versioni (
  documento_id, numero, titolo, corpo, stato,
  pubblicata_at, pubblicata_by,
  created_at, updated_at, created_by, updated_by
)
select
  g.id,
  g.versione,
  g.titolo,
  g.corpo,
  case when g.stato = 'bozza' then 'bozza' else 'pubblicata' end,
  case when g.stato = 'bozza' then null else coalesce(g.updated_at, g.created_at) end,
  case when g.stato = 'bozza' then null else coalesce(g.updated_by, g.created_by) end,
  g.created_at,
  g.updated_at,
  g.created_by,
  g.updated_by
from public.haccp_linee_guida g
where g.deleted_at is null
  and not exists (
    select 1
    from public.haccp_linee_guida_versioni v
    where v.documento_id = g.id
      and v.deleted_at is null
  );

create or replace function public.haccp_linee_guida_versioni_proteggi()
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

  if new.documento_id is distinct from old.documento_id
     or new.numero is distinct from old.numero
     or new.id is distinct from old.id then
    raise exception 'Identificativo della versione non modificabile';
  end if;

  return new;
end;
$$;

drop trigger if exists haccp_linee_guida_versioni_proteggi on public.haccp_linee_guida_versioni;
create trigger haccp_linee_guida_versioni_proteggi
  before update or delete on public.haccp_linee_guida_versioni
  for each row execute function public.haccp_linee_guida_versioni_proteggi();

create or replace function public.haccp_linee_guida_testo_pubblicato()
returns trigger
language plpgsql
as $$
begin
  if exists (
    select 1
    from public.haccp_linee_guida_versioni v
    where v.documento_id = old.id
      and v.stato = 'pubblicata'
      and v.deleted_at is null
  )
  and (
    new.titolo is distinct from old.titolo
    or new.corpo is distinct from old.corpo
    or new.versione is distinct from old.versione
  )
  and coalesce(current_setting('haccp.pubblica', true), '') is distinct from '1'
  then
    raise exception 'Il testo pubblicato si sostituisce solo con una nuova versione';
  end if;
  return new;
end;
$$;

drop trigger if exists haccp_linee_guida_testo_pubblicato on public.haccp_linee_guida;
create trigger haccp_linee_guida_testo_pubblicato
  before update on public.haccp_linee_guida
  for each row execute function public.haccp_linee_guida_testo_pubblicato();

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
  v_ambito text;
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

  select ambito into v_ambito
  from public.haccp_linee_guida
  where id = p_documento_id;

  if v_ambito = 'fornitori' then
    insert into public.haccp_linee_guida_distribuzioni (
      documento_id, versione_id, fornitore_id, stato, notifica_stato,
      created_by, updated_by
    )
    select
      p_documento_id,
      v_id,
      d.fornitore_id,
      'registrata',
      'non_inviata',
      public.app_effective_uid(),
      public.app_effective_uid()
    from public.haccp_linee_guida_destinatari d
    join public.fornitori f on f.id = d.fornitore_id and f.deleted_at is null
    where d.documento_id = p_documento_id
      and d.deleted_at is null
      and not exists (
        select 1
        from public.haccp_linee_guida_distribuzioni x
        where x.versione_id = v_id
          and x.fornitore_id = d.fornitore_id
          and x.deleted_at is null
      );
  end if;

  return v_id;
end;
$$;

comment on function public.pubblica_haccp_linea_guida(uuid) is
  'Congela la bozza in una versione storica e registra la distribuzione ai destinatari. Non invia la mail.';

revoke all on function public.pubblica_haccp_linea_guida(uuid) from public, anon;
grant execute on function public.pubblica_haccp_linea_guida(uuid) to authenticated;

create or replace function public.haccp_distribuzione_solo_pubblicata()
returns trigger
language plpgsql
as $$
begin
  if not exists (
    select 1
    from public.haccp_linee_guida_versioni v
    where v.id = new.versione_id
      and v.documento_id = new.documento_id
      and v.stato = 'pubblicata'
      and v.deleted_at is null
  ) then
    raise exception 'Si distribuisce solo una versione pubblicata';
  end if;
  return new;
end;
$$;

drop trigger if exists haccp_distribuzione_solo_pubblicata on public.haccp_linee_guida_distribuzioni;
create trigger haccp_distribuzione_solo_pubblicata
  before insert or update on public.haccp_linee_guida_distribuzioni
  for each row execute function public.haccp_distribuzione_solo_pubblicata();

alter table public.haccp_linee_guida_versioni enable row level security;
alter table public.haccp_linee_guida_destinatari enable row level security;
alter table public.haccp_linee_guida_distribuzioni enable row level security;
alter table public.haccp_linee_guida_prese_visione enable row level security;

drop policy if exists "haccp_linee_guida_versioni_select" on public.haccp_linee_guida_versioni;
create policy "haccp_linee_guida_versioni_select"
  on public.haccp_linee_guida_versioni for select
  to authenticated
  using (
    public.is_superadmin()
    or public.has_area_access('produzione')
    or public.has_area_access('amministrazione')
    or (
      stato = 'pubblicata'
      and deleted_at is null
      and exists (
        select 1
        from public.haccp_linee_guida_distribuzioni d
        where d.versione_id = haccp_linee_guida_versioni.id
          and d.fornitore_id = public.fornitore_collegato_id()
          and d.deleted_at is null
          and d.stato = 'registrata'
      )
    )
  );

drop policy if exists "haccp_linee_guida_versioni_insert" on public.haccp_linee_guida_versioni;
create policy "haccp_linee_guida_versioni_insert"
  on public.haccp_linee_guida_versioni for insert
  to authenticated
  with check (
    stato = 'bozza'
    and pubblicata_at is null
    and (
      public.is_superadmin()
      or public.has_area_access('produzione')
      or public.has_area_access('amministrazione')
    )
  );

drop policy if exists "haccp_linee_guida_versioni_update" on public.haccp_linee_guida_versioni;
create policy "haccp_linee_guida_versioni_update"
  on public.haccp_linee_guida_versioni for update
  to authenticated
  using (
    stato = 'bozza'
    and (
      public.is_superadmin()
      or public.has_area_access('produzione')
      or public.has_area_access('amministrazione')
    )
  )
  with check (
    stato = 'bozza'
    and pubblicata_at is null
    and (
      public.is_superadmin()
      or public.has_area_access('produzione')
      or public.has_area_access('amministrazione')
    )
  );

drop policy if exists "haccp_linee_guida_destinatari_select" on public.haccp_linee_guida_destinatari;
create policy "haccp_linee_guida_destinatari_select"
  on public.haccp_linee_guida_destinatari for select
  to authenticated
  using (
    public.is_superadmin()
    or public.has_area_access('produzione')
    or public.has_area_access('amministrazione')
  );

drop policy if exists "haccp_linee_guida_destinatari_insert" on public.haccp_linee_guida_destinatari;
create policy "haccp_linee_guida_destinatari_insert"
  on public.haccp_linee_guida_destinatari for insert
  to authenticated
  with check (
    public.is_superadmin()
    or public.has_area_access('produzione')
    or public.has_area_access('amministrazione')
  );

drop policy if exists "haccp_linee_guida_destinatari_update" on public.haccp_linee_guida_destinatari;
create policy "haccp_linee_guida_destinatari_update"
  on public.haccp_linee_guida_destinatari for update
  to authenticated
  using (
    public.is_superadmin()
    or public.has_area_access('produzione')
    or public.has_area_access('amministrazione')
  )
  with check (
    public.is_superadmin()
    or public.has_area_access('produzione')
    or public.has_area_access('amministrazione')
  );

drop policy if exists "haccp_linee_guida_distribuzioni_select" on public.haccp_linee_guida_distribuzioni;
create policy "haccp_linee_guida_distribuzioni_select"
  on public.haccp_linee_guida_distribuzioni for select
  to authenticated
  using (
    public.is_superadmin()
    or public.has_area_access('produzione')
    or public.has_area_access('amministrazione')
    or (
      fornitore_id = public.fornitore_collegato_id()
      and deleted_at is null
      and stato = 'registrata'
    )
  );

drop policy if exists "haccp_linee_guida_distribuzioni_insert" on public.haccp_linee_guida_distribuzioni;
create policy "haccp_linee_guida_distribuzioni_insert"
  on public.haccp_linee_guida_distribuzioni for insert
  to authenticated
  with check (
    public.is_superadmin()
    or public.has_area_access('produzione')
    or public.has_area_access('amministrazione')
  );

drop policy if exists "haccp_linee_guida_distribuzioni_update" on public.haccp_linee_guida_distribuzioni;
create policy "haccp_linee_guida_distribuzioni_update"
  on public.haccp_linee_guida_distribuzioni for update
  to authenticated
  using (
    public.is_superadmin()
    or public.has_area_access('produzione')
    or public.has_area_access('amministrazione')
  )
  with check (
    public.is_superadmin()
    or public.has_area_access('produzione')
    or public.has_area_access('amministrazione')
  );

drop policy if exists "haccp_linee_guida_prese_visione_select" on public.haccp_linee_guida_prese_visione;
create policy "haccp_linee_guida_prese_visione_select"
  on public.haccp_linee_guida_prese_visione for select
  to authenticated
  using (
    public.is_superadmin()
    or public.has_area_access('produzione')
    or public.has_area_access('amministrazione')
    or fornitore_id = public.fornitore_collegato_id()
  );

drop policy if exists "haccp_linee_guida_prese_visione_insert" on public.haccp_linee_guida_prese_visione;
create policy "haccp_linee_guida_prese_visione_insert"
  on public.haccp_linee_guida_prese_visione for insert
  to authenticated
  with check (
    profile_id = public.app_effective_uid()
    and created_by = public.app_effective_uid()
    and fornitore_id = public.fornitore_collegato_id()
    and exists (
      select 1
      from public.haccp_linee_guida_distribuzioni d
      join public.haccp_linee_guida_versioni v on v.id = d.versione_id
      where d.versione_id = haccp_linee_guida_prese_visione.versione_id
        and d.documento_id = haccp_linee_guida_prese_visione.documento_id
        and d.fornitore_id = haccp_linee_guida_prese_visione.fornitore_id
        and d.deleted_at is null
        and d.stato = 'registrata'
        and v.stato = 'pubblicata'
        and v.deleted_at is null
    )
  );

grant select, insert, update on public.haccp_linee_guida_versioni to authenticated;
grant select, insert, update on public.haccp_linee_guida_destinatari to authenticated;
grant select, insert, update on public.haccp_linee_guida_distribuzioni to authenticated;
grant select, insert on public.haccp_linee_guida_prese_visione to authenticated;

revoke update, delete on public.haccp_linee_guida_prese_visione from authenticated, anon;
revoke delete on public.haccp_linee_guida_versioni from authenticated, anon;
revoke delete on public.haccp_linee_guida_destinatari from authenticated, anon;
revoke delete on public.haccp_linee_guida_distribuzioni from authenticated, anon;
revoke all on public.haccp_linee_guida_versioni from anon;
revoke all on public.haccp_linee_guida_destinatari from anon;
revoke all on public.haccp_linee_guida_distribuzioni from anon;
revoke all on public.haccp_linee_guida_prese_visione from anon;

drop policy if exists "fornitori_select_produzione" on public.fornitori;
create policy "fornitori_select_produzione"
  on public.fornitori for select
  to authenticated
  using (
    deleted_at is null
    and public.has_area_access('produzione')
  );
