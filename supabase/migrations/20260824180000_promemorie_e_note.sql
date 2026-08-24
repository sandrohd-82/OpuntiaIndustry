-- Area Promemorie e note + clienti possibili clienti
-- ISO 9001: audit, soft delete, stati, RLS

-- ---------------------------------------------------------------------------
-- Area menu (tra Chat e Area Fiscale → sort_order 50)
-- ---------------------------------------------------------------------------
insert into public.areas (slug, name, description, icon, sort_order, is_active)
values (
  'promemorie-e-note',
  'Promemorie e note',
  'Promemoria, attività e note collegabili alle anagrafiche',
  'sticky-note',
  50,
  true
)
on conflict (slug) do update
set
  name = excluded.name,
  description = excluded.description,
  icon = excluded.icon,
  sort_order = excluded.sort_order,
  is_active = true;

update public.areas set sort_order = 45 where slug = 'chat';
update public.areas set sort_order = 50 where slug = 'promemorie-e-note';
update public.areas set sort_order = 55 where slug = 'area-fiscale';

insert into public.role_area_permissions (role_id, area_id, can_access)
select r.id, a.id, true
from public.app_roles r
cross join public.areas a
where a.slug = 'promemorie-e-note'
  and r.code in ('superadmin', 'admin', 'manager', 'operator')
on conflict (role_id, area_id) do update set can_access = true;

-- ---------------------------------------------------------------------------
-- Possibili clienti (lead)
-- ---------------------------------------------------------------------------
create table if not exists public.clienti_possibili (
  id uuid primary key default gen_random_uuid(),
  ragione_sociale text not null,
  referente text not null default '',
  telefono text not null default '',
  email text not null default '',
  note_interne text not null default '',
  stato text not null default 'da_valutare'
    check (stato in ('da_valutare', 'in_contatto', 'convertito', 'scartato')),
  cliente_id uuid,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  created_by uuid references auth.users (id) on delete set null,
  updated_by uuid references auth.users (id) on delete set null,
  deleted_at timestamptz,
  deleted_by uuid references auth.users (id) on delete set null,
  constraint clienti_possibili_rs_len check (
    char_length(trim(ragione_sociale)) >= 1
    and char_length(ragione_sociale) <= 200
  )
);

create index if not exists clienti_possibili_stato_idx
  on public.clienti_possibili (stato, updated_at desc)
  where deleted_at is null;

drop trigger if exists clienti_possibili_updated_at on public.clienti_possibili;
create trigger clienti_possibili_updated_at
  before update on public.clienti_possibili
  for each row execute function public.set_updated_at();

alter table public.clienti_possibili enable row level security;
create policy "clienti_possibili_select" on public.clienti_possibili
  for select to authenticated
  using (
    deleted_at is null
    and (public.has_area_access('amministrazione') or public.is_superadmin())
  );
create policy "clienti_possibili_insert" on public.clienti_possibili
  for insert to authenticated
  with check (public.has_area_access('amministrazione') or public.is_superadmin());
create policy "clienti_possibili_update" on public.clienti_possibili
  for update to authenticated
  using (public.has_area_access('amministrazione') or public.is_superadmin())
  with check (public.has_area_access('amministrazione') or public.is_superadmin());

grant select, insert, update on public.clienti_possibili to authenticated;
grant all on public.clienti_possibili to postgres, service_role;
revoke delete on public.clienti_possibili from authenticated;

-- ---------------------------------------------------------------------------
-- Promemoria
-- ---------------------------------------------------------------------------
create table if not exists public.pn_promemoria (
  id uuid primary key default gen_random_uuid(),
  titolo text not null,
  descrizione text not null default '',
  due_at timestamptz not null,
  stato text not null default 'attivo'
    check (stato in ('attivo', 'completato', 'archiviato')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  created_by uuid references auth.users (id) on delete set null,
  updated_by uuid references auth.users (id) on delete set null,
  deleted_at timestamptz,
  deleted_by uuid references auth.users (id) on delete set null,
  constraint pn_promemoria_titolo_len check (
    char_length(trim(titolo)) >= 1 and char_length(titolo) <= 200
  )
);

create index if not exists pn_promemoria_due_idx
  on public.pn_promemoria (due_at asc)
  where deleted_at is null and stato = 'attivo';

drop trigger if exists pn_promemoria_updated_at on public.pn_promemoria;
create trigger pn_promemoria_updated_at
  before update on public.pn_promemoria
  for each row execute function public.set_updated_at();

-- ---------------------------------------------------------------------------
-- Attività
-- ---------------------------------------------------------------------------
create table if not exists public.pn_attivita (
  id uuid primary key default gen_random_uuid(),
  titolo text not null,
  descrizione text not null default '',
  luogo text not null default '',
  due_at timestamptz not null,
  stato text not null default 'pianificata'
    check (stato in ('pianificata', 'in_corso', 'completata', 'archiviata')),
  versione integer not null default 1 check (versione >= 1),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  created_by uuid references auth.users (id) on delete set null,
  updated_by uuid references auth.users (id) on delete set null,
  deleted_at timestamptz,
  deleted_by uuid references auth.users (id) on delete set null,
  constraint pn_attivita_titolo_len check (
    char_length(trim(titolo)) >= 1 and char_length(titolo) <= 200
  )
);

create index if not exists pn_attivita_due_idx
  on public.pn_attivita (due_at asc)
  where deleted_at is null and stato in ('pianificata', 'in_corso');

drop trigger if exists pn_attivita_updated_at on public.pn_attivita;
create trigger pn_attivita_updated_at
  before update on public.pn_attivita
  for each row execute function public.set_updated_at();

create table if not exists public.pn_attivita_mentions (
  id uuid primary key default gen_random_uuid(),
  attivita_id uuid not null references public.pn_attivita (id) on delete cascade,
  user_id uuid not null references auth.users (id) on delete cascade,
  created_at timestamptz not null default now(),
  created_by uuid references auth.users (id) on delete set null,
  deleted_at timestamptz,
  deleted_by uuid references auth.users (id) on delete set null
);

create unique index if not exists pn_attivita_mentions_open_uidx
  on public.pn_attivita_mentions (attivita_id, user_id)
  where deleted_at is null;

-- ---------------------------------------------------------------------------
-- Note (post-it collegabili)
-- ---------------------------------------------------------------------------
create table if not exists public.pn_note (
  id uuid primary key default gen_random_uuid(),
  titolo text not null default '',
  body text not null default '',
  colore text not null default 'giallo'
    check (colore in ('giallo', 'verde', 'blu', 'rosa', 'grigio')),
  due_at timestamptz,
  entity_type text
    check (
      entity_type is null
      or entity_type in (
        'cliente',
        'fornitore',
        'cliente_possibile',
        'ordine',
        'altro'
      )
    ),
  entity_id uuid,
  entity_label text not null default '',
  stato text not null default 'attiva'
    check (stato in ('attiva', 'archiviata')),
  versione integer not null default 1 check (versione >= 1),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  created_by uuid references auth.users (id) on delete set null,
  updated_by uuid references auth.users (id) on delete set null,
  deleted_at timestamptz,
  deleted_by uuid references auth.users (id) on delete set null
);

create index if not exists pn_note_due_idx
  on public.pn_note (due_at desc nulls last)
  where deleted_at is null;

create index if not exists pn_note_entity_idx
  on public.pn_note (entity_type, entity_id)
  where deleted_at is null and entity_type is not null;

drop trigger if exists pn_note_updated_at on public.pn_note;
create trigger pn_note_updated_at
  before update on public.pn_note
  for each row execute function public.set_updated_at();

-- ---------------------------------------------------------------------------
-- RLS Promemorie e note
-- ---------------------------------------------------------------------------
alter table public.pn_promemoria enable row level security;
alter table public.pn_attivita enable row level security;
alter table public.pn_attivita_mentions enable row level security;
alter table public.pn_note enable row level security;

create policy "pn_promemoria_all" on public.pn_promemoria
  for all to authenticated
  using (
    deleted_at is null
    and (public.has_area_access('promemorie-e-note') or public.is_superadmin())
  )
  with check (public.has_area_access('promemorie-e-note') or public.is_superadmin());

create policy "pn_attivita_all" on public.pn_attivita
  for all to authenticated
  using (
    deleted_at is null
    and (public.has_area_access('promemorie-e-note') or public.is_superadmin())
  )
  with check (public.has_area_access('promemorie-e-note') or public.is_superadmin());

create policy "pn_attivita_mentions_all" on public.pn_attivita_mentions
  for all to authenticated
  using (public.has_area_access('promemorie-e-note') or public.is_superadmin())
  with check (public.has_area_access('promemorie-e-note') or public.is_superadmin());

-- Note: leggibili anche da amministrazione (creazione da schede anagrafica)
create policy "pn_note_select" on public.pn_note
  for select to authenticated
  using (
    deleted_at is null
    and (
      public.has_area_access('promemorie-e-note')
      or public.has_area_access('amministrazione')
      or public.is_superadmin()
    )
  );
create policy "pn_note_insert" on public.pn_note
  for insert to authenticated
  with check (
    public.has_area_access('promemorie-e-note')
    or public.has_area_access('amministrazione')
    or public.is_superadmin()
  );
create policy "pn_note_update" on public.pn_note
  for update to authenticated
  using (
    public.has_area_access('promemorie-e-note')
    or public.has_area_access('amministrazione')
    or public.is_superadmin()
  )
  with check (
    public.has_area_access('promemorie-e-note')
    or public.has_area_access('amministrazione')
    or public.is_superadmin()
  );

grant select, insert, update on public.pn_promemoria to authenticated;
grant select, insert, update on public.pn_attivita to authenticated;
grant select, insert, update on public.pn_attivita_mentions to authenticated;
grant select, insert, update on public.pn_note to authenticated;
grant all on public.pn_promemoria to postgres, service_role;
grant all on public.pn_attivita to postgres, service_role;
grant all on public.pn_attivita_mentions to postgres, service_role;
grant all on public.pn_note to postgres, service_role;
revoke delete on public.pn_promemoria from authenticated;
revoke delete on public.pn_attivita from authenticated;
revoke delete on public.pn_attivita_mentions from authenticated;
revoke delete on public.pn_note from authenticated;
