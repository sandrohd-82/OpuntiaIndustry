-- Organigramma: anagrafica persone, mansioni, documenti, attività, permessi,
-- autorizzazioni postazione. ISO 9001 8.5.2 / 7.5 / 6.1.

create table if not exists public.organigramma_mansioni (
  id uuid primary key default gen_random_uuid(),
  codice text not null,
  nome text not null,
  descrizione text not null default '',
  documento_stato text not null default 'approvato'
    check (documento_stato in ('bozza', 'approvato')),
  versione integer not null default 1,
  created_by uuid references auth.users (id) on delete set null,
  updated_by uuid references auth.users (id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz,
  deleted_by uuid references auth.users (id) on delete set null
);

create unique index if not exists organigramma_mansioni_codice_uidx
  on public.organigramma_mansioni (lower(codice))
  where deleted_at is null;

drop trigger if exists organigramma_mansioni_updated_at on public.organigramma_mansioni;
create trigger organigramma_mansioni_updated_at
  before update on public.organigramma_mansioni
  for each row execute function public.set_updated_at();

alter table public.organigramma_mansioni enable row level security;
drop policy if exists organigramma_mansioni_select on public.organigramma_mansioni;
create policy organigramma_mansioni_select
  on public.organigramma_mansioni for select to authenticated
  using (
    public.has_area_access('amministrazione')
    or public.has_area_access('produzione')
    or public.is_superadmin()
  );
drop policy if exists organigramma_mansioni_write on public.organigramma_mansioni;
create policy organigramma_mansioni_write
  on public.organigramma_mansioni for insert to authenticated
  with check (public.is_admin() or public.is_superadmin());
drop policy if exists organigramma_mansioni_update on public.organigramma_mansioni;
create policy organigramma_mansioni_update
  on public.organigramma_mansioni for update to authenticated
  using (public.is_admin() or public.is_superadmin())
  with check (public.is_admin() or public.is_superadmin());

grant select on table public.organigramma_mansioni to authenticated;
grant insert, update on table public.organigramma_mansioni to authenticated;
grant all on table public.organigramma_mansioni to postgres, service_role;
revoke delete on table public.organigramma_mansioni from authenticated;

insert into public.organigramma_mansioni (codice, nome, descrizione)
select v.codice, v.nome, v.descrizione
from (values
  ('operatore', 'Operatore', 'Operatore di produzione'),
  ('responsabile-area', 'Responsabile di area', 'Responsabile di un’area produttiva'),
  ('capo-turno', 'Capo turno', 'Coordinamento turno'),
  ('amministrazione', 'Amministrazione', 'Ufficio amministrazione'),
  ('direzione', 'Direzione', 'Direzione aziendale')
) as v(codice, nome, descrizione)
where not exists (
  select 1 from public.organigramma_mansioni m
  where lower(m.codice) = v.codice and m.deleted_at is null
);

create table if not exists public.organigramma_persone (
  id uuid primary key default gen_random_uuid(),
  nome text not null,
  cognome text not null,
  codice_fiscale text not null default '',
  carta_identita text not null default '',
  user_id uuid references auth.users (id) on delete set null,
  parent_id uuid references public.organigramma_persone (id) on delete set null,
  sort_order integer not null default 100,
  foto_path text,
  documento_stato text not null default 'bozza'
    check (documento_stato in ('bozza', 'approvato', 'chiuso')),
  versione integer not null default 1,
  note text not null default '',
  created_by uuid references auth.users (id) on delete set null,
  updated_by uuid references auth.users (id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz,
  deleted_by uuid references auth.users (id) on delete set null
);

create unique index if not exists organigramma_persone_cf_uidx
  on public.organigramma_persone (lower(codice_fiscale))
  where deleted_at is null and codice_fiscale <> '';

create unique index if not exists organigramma_persone_user_uidx
  on public.organigramma_persone (user_id)
  where deleted_at is null and user_id is not null;

create index if not exists organigramma_persone_parent_idx
  on public.organigramma_persone (parent_id, sort_order)
  where deleted_at is null;

comment on table public.organigramma_persone is
  'Anagrafica personale (distinta dal login). parent_id = posizione in albero.';

drop trigger if exists organigramma_persone_updated_at on public.organigramma_persone;
create trigger organigramma_persone_updated_at
  before update on public.organigramma_persone
  for each row execute function public.set_updated_at();

alter table public.organigramma_persone enable row level security;
drop policy if exists organigramma_persone_select on public.organigramma_persone;
create policy organigramma_persone_select
  on public.organigramma_persone for select to authenticated
  using (
    public.has_area_access('amministrazione')
    or public.has_area_access('produzione')
    or public.is_superadmin()
  );
drop policy if exists organigramma_persone_write on public.organigramma_persone;
create policy organigramma_persone_write
  on public.organigramma_persone for insert to authenticated
  with check (public.is_admin() or public.is_superadmin());
drop policy if exists organigramma_persone_update on public.organigramma_persone;
create policy organigramma_persone_update
  on public.organigramma_persone for update to authenticated
  using (public.is_admin() or public.is_superadmin())
  with check (public.is_admin() or public.is_superadmin());

grant select on table public.organigramma_persone to authenticated;
grant insert, update on table public.organigramma_persone to authenticated;
grant all on table public.organigramma_persone to postgres, service_role;
revoke delete on table public.organigramma_persone from authenticated;

create table if not exists public.organigramma_persona_mansioni (
  id uuid primary key default gen_random_uuid(),
  persona_id uuid not null references public.organigramma_persone (id),
  mansione_id uuid not null references public.organigramma_mansioni (id),
  created_by uuid references auth.users (id) on delete set null,
  created_at timestamptz not null default now(),
  deleted_at timestamptz,
  deleted_by uuid references auth.users (id) on delete set null
);

create unique index if not exists organigramma_persona_mansioni_uidx
  on public.organigramma_persona_mansioni (persona_id, mansione_id)
  where deleted_at is null;

alter table public.organigramma_persona_mansioni enable row level security;
drop policy if exists organigramma_pm_all on public.organigramma_persona_mansioni;
create policy organigramma_pm_all
  on public.organigramma_persona_mansioni for all to authenticated
  using (
    public.has_area_access('amministrazione')
    or public.has_area_access('produzione')
    or public.is_superadmin()
  )
  with check (public.is_admin() or public.is_superadmin());

grant select, insert, update on table public.organigramma_persona_mansioni to authenticated;
grant all on table public.organigramma_persona_mansioni to postgres, service_role;
revoke delete on table public.organigramma_persona_mansioni from authenticated;

create table if not exists public.produzione_posto_autorizzati (
  id uuid primary key default gen_random_uuid(),
  posto_id uuid not null references public.produzione_posti_lavoro (id),
  persona_id uuid not null references public.organigramma_persone (id),
  created_by uuid references auth.users (id) on delete set null,
  updated_by uuid references auth.users (id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz,
  deleted_by uuid references auth.users (id) on delete set null
);

create unique index if not exists produzione_posto_autorizzati_uidx
  on public.produzione_posto_autorizzati (posto_id, persona_id)
  where deleted_at is null;

drop trigger if exists produzione_posto_autorizzati_updated_at
  on public.produzione_posto_autorizzati;
create trigger produzione_posto_autorizzati_updated_at
  before update on public.produzione_posto_autorizzati
  for each row execute function public.set_updated_at();

alter table public.produzione_posto_autorizzati enable row level security;
drop policy if exists produzione_posto_aut_select on public.produzione_posto_autorizzati;
create policy produzione_posto_aut_select
  on public.produzione_posto_autorizzati for select to authenticated
  using (
    public.has_area_access('produzione')
    or public.has_area_access('amministrazione')
    or public.is_superadmin()
  );
drop policy if exists produzione_posto_aut_write on public.produzione_posto_autorizzati;
create policy produzione_posto_aut_write
  on public.produzione_posto_autorizzati for insert to authenticated
  with check (public.is_admin() or public.is_superadmin());
drop policy if exists produzione_posto_aut_update on public.produzione_posto_autorizzati;
create policy produzione_posto_aut_update
  on public.produzione_posto_autorizzati for update to authenticated
  using (public.is_admin() or public.is_superadmin())
  with check (public.is_admin() or public.is_superadmin());

grant select on table public.produzione_posto_autorizzati to authenticated;
grant insert, update on table public.produzione_posto_autorizzati to authenticated;
grant all on table public.produzione_posto_autorizzati to postgres, service_role;
revoke delete on table public.produzione_posto_autorizzati from authenticated;

create table if not exists public.organigramma_documenti (
  id uuid primary key default gen_random_uuid(),
  persona_id uuid not null references public.organigramma_persone (id),
  tipo text not null
    check (tipo in (
      'cf_fronte', 'cf_retro', 'ci_fronte', 'ci_retro',
      'corso', 'certificato', 'busta_paga', 'altro'
    )),
  titolo text not null default '',
  periodo text not null default '',
  note text not null default '',
  storage_path text not null,
  file_name text not null default '',
  mime text not null default '',
  documento_stato text not null default 'bozza'
    check (documento_stato in ('bozza', 'approvato')),
  versione integer not null default 1,
  approved_by uuid references auth.users (id) on delete set null,
  approved_at timestamptz,
  created_by uuid references auth.users (id) on delete set null,
  updated_by uuid references auth.users (id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz,
  deleted_by uuid references auth.users (id) on delete set null
);

create index if not exists organigramma_documenti_persona_idx
  on public.organigramma_documenti (persona_id, tipo, created_at desc)
  where deleted_at is null;

drop trigger if exists organigramma_documenti_updated_at on public.organigramma_documenti;
create trigger organigramma_documenti_updated_at
  before update on public.organigramma_documenti
  for each row execute function public.set_updated_at();

alter table public.organigramma_documenti enable row level security;
drop policy if exists organigramma_docs_select on public.organigramma_documenti;
create policy organigramma_docs_select
  on public.organigramma_documenti for select to authenticated
  using (
    public.has_area_access('amministrazione') or public.is_superadmin()
  );
drop policy if exists organigramma_docs_write on public.organigramma_documenti;
create policy organigramma_docs_write
  on public.organigramma_documenti for insert to authenticated
  with check (public.is_admin() or public.is_superadmin());
drop policy if exists organigramma_docs_update on public.organigramma_documenti;
create policy organigramma_docs_update
  on public.organigramma_documenti for update to authenticated
  using (public.is_admin() or public.is_superadmin())
  with check (public.is_admin() or public.is_superadmin());

grant select on table public.organigramma_documenti to authenticated;
grant insert, update on table public.organigramma_documenti to authenticated;
grant all on table public.organigramma_documenti to postgres, service_role;
revoke delete on table public.organigramma_documenti from authenticated;

create table if not exists public.organigramma_attivita (
  id uuid primary key default gen_random_uuid(),
  persona_id uuid not null references public.organigramma_persone (id),
  azione text not null,
  origine text not null default 'scheda',
  actor_nome text not null default '',
  note text not null default '',
  created_by uuid references auth.users (id) on delete set null,
  created_at timestamptz not null default now()
);

create index if not exists organigramma_attivita_persona_idx
  on public.organigramma_attivita (persona_id, created_at desc);

comment on table public.organigramma_attivita is
  'Registro immutabile attività persona. Solo insert.';

alter table public.organigramma_attivita enable row level security;
drop policy if exists organigramma_att_select on public.organigramma_attivita;
create policy organigramma_att_select
  on public.organigramma_attivita for select to authenticated
  using (
    public.has_area_access('amministrazione') or public.is_superadmin()
  );
drop policy if exists organigramma_att_insert on public.organigramma_attivita;
create policy organigramma_att_insert
  on public.organigramma_attivita for insert to authenticated
  with check (
    public.has_area_access('amministrazione') or public.is_superadmin()
  );

grant select, insert on table public.organigramma_attivita to authenticated;
grant all on table public.organigramma_attivita to postgres, service_role;
revoke update, delete on table public.organigramma_attivita from authenticated;

create table if not exists public.organigramma_permessi (
  id uuid primary key default gen_random_uuid(),
  persona_id uuid not null references public.organigramma_persone (id),
  tipo text not null
    check (tipo in ('ferie', 'permesso', 'malattia', 'altro')),
  dal date not null,
  al date not null,
  note text not null default '',
  documento_stato text not null default 'bozza'
    check (documento_stato in ('bozza', 'approvato', 'chiuso', 'rifiutato')),
  versione integer not null default 1,
  approved_by uuid references auth.users (id) on delete set null,
  approved_at timestamptz,
  created_by uuid references auth.users (id) on delete set null,
  updated_by uuid references auth.users (id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz,
  deleted_by uuid references auth.users (id) on delete set null
);

create index if not exists organigramma_permessi_persona_idx
  on public.organigramma_permessi (persona_id, dal desc)
  where deleted_at is null;

drop trigger if exists organigramma_permessi_updated_at on public.organigramma_permessi;
create trigger organigramma_permessi_updated_at
  before update on public.organigramma_permessi
  for each row execute function public.set_updated_at();

alter table public.organigramma_permessi enable row level security;
drop policy if exists organigramma_perm_select on public.organigramma_permessi;
create policy organigramma_perm_select
  on public.organigramma_permessi for select to authenticated
  using (
    public.has_area_access('amministrazione') or public.is_superadmin()
  );
drop policy if exists organigramma_perm_write on public.organigramma_permessi;
create policy organigramma_perm_write
  on public.organigramma_permessi for insert to authenticated
  with check (public.is_admin() or public.is_superadmin());
drop policy if exists organigramma_perm_update on public.organigramma_permessi;
create policy organigramma_perm_update
  on public.organigramma_permessi for update to authenticated
  using (public.is_admin() or public.is_superadmin())
  with check (public.is_admin() or public.is_superadmin());

grant select on table public.organigramma_permessi to authenticated;
grant insert, update on table public.organigramma_permessi to authenticated;
grant all on table public.organigramma_permessi to postgres, service_role;
revoke delete on table public.organigramma_permessi from authenticated;

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'organigramma-docs',
  'organigramma-docs',
  false,
  15728640,
  array[
    'application/pdf',
    'image/jpeg',
    'image/png',
    'image/webp'
  ]::text[]
)
on conflict (id) do update set
  public = excluded.public,
  file_size_limit = excluded.file_size_limit,
  allowed_mime_types = excluded.allowed_mime_types;

drop policy if exists organigramma_docs_storage_select on storage.objects;
create policy organigramma_docs_storage_select
  on storage.objects for select to authenticated
  using (
    bucket_id = 'organigramma-docs'
    and (public.has_area_access('amministrazione') or public.is_superadmin())
  );

drop policy if exists organigramma_docs_storage_insert on storage.objects;
create policy organigramma_docs_storage_insert
  on storage.objects for insert to authenticated
  with check (
    bucket_id = 'organigramma-docs'
    and (public.is_admin() or public.is_superadmin())
  );

drop policy if exists organigramma_docs_storage_update on storage.objects;
create policy organigramma_docs_storage_update
  on storage.objects for update to authenticated
  using (
    bucket_id = 'organigramma-docs'
    and (public.is_admin() or public.is_superadmin())
  )
  with check (
    bucket_id = 'organigramma-docs'
    and (public.is_admin() or public.is_superadmin())
  );
