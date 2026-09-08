-- Area Archivio (ultimo menu) al posto di Script.
-- Soft delete / deprecato / audit invariati (ISO 9001).
-- Lo script Pesata resta in Produzione (tabelle gestionale_script).

-- ---------------------------------------------------------------------------
-- Menu: disattiva Script, inserisci Archivio
-- ---------------------------------------------------------------------------
update public.areas
set
  is_active = false,
  name = 'Script',
  description = 'Disattivata: catalogo funzioni spostato in Produzione'
where slug = 'script';

insert into public.areas (slug, name, description, icon, sort_order, is_active)
values (
  'archivio',
  'Archivio',
  'Storici, archivi e tracciabilità delle aree operative',
  'archive',
  110,
  true
)
on conflict (slug) do update
set
  name = excluded.name,
  description = excluded.description,
  icon = excluded.icon,
  sort_order = excluded.sort_order,
  is_active = true;

insert into public.role_area_permissions (role_id, area_id, can_access)
select r.id, a.id, true
from public.app_roles r
cross join public.areas a
where a.slug = 'archivio'
  and r.code in ('superadmin', 'admin', 'manager', 'operator')
on conflict (role_id, area_id) do update set can_access = true;

-- RLS catalogo script: non dipende più dall'area Script
drop policy if exists gestionale_script_all on public.gestionale_script;
create policy gestionale_script_all
  on public.gestionale_script for all to authenticated
  using (
    public.has_area_access('produzione')
    or public.has_area_access('amministrazione')
    or public.is_superadmin()
  )
  with check (
    public.has_area_access('produzione')
    or public.has_area_access('amministrazione')
    or public.is_superadmin()
  );

drop policy if exists produzione_processo_attivita_script_all
  on public.produzione_processo_attivita_script;
create policy produzione_processo_attivita_script_all
  on public.produzione_processo_attivita_script for all to authenticated
  using (
    public.has_area_access('produzione')
    or public.has_area_access('amministrazione')
    or public.is_superadmin()
  )
  with check (
    public.has_area_access('produzione')
    or public.has_area_access('amministrazione')
    or public.is_superadmin()
  );

-- ---------------------------------------------------------------------------
-- Attività: elenco / storico (deprecato) / elimina (soft delete)
-- ---------------------------------------------------------------------------
alter table public.produzione_processo_attivita
  add column if not exists deprecato_at timestamptz,
  add column if not exists deprecato_by uuid references auth.users (id) on delete set null,
  add column if not exists deprecato_note text not null default '',
  add column if not exists sostituito_da uuid references public.produzione_processo_attivita (id) on delete set null;

comment on column public.produzione_processo_attivita.deprecato_at is
  'Se valorizzato l''attività è nello storico (deprecata), non in elenco.';

create index if not exists produzione_processo_attivita_elenco_idx
  on public.produzione_processo_attivita (codice)
  where deleted_at is null and deprecato_at is null;

create index if not exists produzione_processo_attivita_storico_idx
  on public.produzione_processo_attivita (deprecato_at desc)
  where deleted_at is null and deprecato_at is not null;

-- ---------------------------------------------------------------------------
-- WebMail: cartella Archiviate (distinta dal cestino)
-- ---------------------------------------------------------------------------
alter table public.webmail_messaggi
  add column if not exists archived_at timestamptz,
  add column if not exists archived_by uuid references auth.users (id) on delete set null;

comment on column public.webmail_messaggi.archived_at is
  'Mail archiviata (non cestino). Visibile in Archivio > WebMail > Casella > Archiviate.';

create index if not exists webmail_messaggi_archiviate_idx
  on public.webmail_messaggi (account_id, archived_at desc)
  where deleted_at is null and archived_at is not null;

-- ---------------------------------------------------------------------------
-- Chat: argomenti archiviati dell'utente
-- ---------------------------------------------------------------------------
create or replace function public.list_my_archived_chat_topics()
returns table (
  id uuid,
  titolo text,
  stato text,
  created_at timestamptz,
  updated_at timestamptz,
  is_new boolean
)
language sql
stable
security invoker
set search_path = public
as $$
  select
    t.id,
    t.titolo,
    t.stato,
    t.created_at,
    t.updated_at,
    false as is_new
  from public.chat_topic_members m
  join public.chat_topics t on t.id = m.topic_id
  where m.user_id = auth.uid()
    and m.deleted_at is null
    and t.deleted_at is null
    and t.stato = 'archiviato'
  order by t.updated_at desc;
$$;

grant execute on function public.list_my_archived_chat_topics() to authenticated;
