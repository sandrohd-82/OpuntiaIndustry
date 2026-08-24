-- Rubrica contatti + link a possibili clienti + timeline interazioni
-- ISO 9001: audit, soft delete, RLS

-- ---------------------------------------------------------------------------
-- Contatti rubrica
-- ---------------------------------------------------------------------------
create table if not exists public.rubrica_contatti (
  id uuid primary key default gen_random_uuid(),
  nome text not null,
  cognome text not null,
  telefono text not null default '',
  email text not null default '',
  -- Rapporto: es. dipendente
  rapporto text not null default 'dipendente'
    check (rapporto in ('dipendente', 'referente', 'altro')),
  -- Azienda collegata
  azienda_tipo text not null default 'agrinsicilia'
    check (
      azienda_tipo in (
        'cliente',
        'fornitore',
        'cliente_possibile',
        'agrinsicilia'
      )
    ),
  azienda_id uuid,
  azienda_label text not null default '',
  mansione text not null default '',
  note text not null default '',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  created_by uuid references auth.users (id) on delete set null,
  updated_by uuid references auth.users (id) on delete set null,
  deleted_at timestamptz,
  deleted_by uuid references auth.users (id) on delete set null,
  constraint rubrica_contatti_nome_len check (
    char_length(trim(nome)) >= 1 and char_length(nome) <= 80
  ),
  constraint rubrica_contatti_cognome_len check (
    char_length(trim(cognome)) >= 1 and char_length(cognome) <= 80
  )
);

create index if not exists rubrica_contatti_nome_idx
  on public.rubrica_contatti (cognome, nome)
  where deleted_at is null;
create index if not exists rubrica_contatti_azienda_idx
  on public.rubrica_contatti (azienda_tipo, azienda_id)
  where deleted_at is null;

drop trigger if exists rubrica_contatti_updated_at on public.rubrica_contatti;
create trigger rubrica_contatti_updated_at
  before update on public.rubrica_contatti
  for each row execute function public.set_updated_at();

alter table public.rubrica_contatti enable row level security;
create policy "rubrica_contatti_select" on public.rubrica_contatti
  for select to authenticated
  using (
    deleted_at is null
    and (public.has_area_access('amministrazione') or public.is_superadmin())
  );
create policy "rubrica_contatti_insert" on public.rubrica_contatti
  for insert to authenticated
  with check (public.has_area_access('amministrazione') or public.is_superadmin());
create policy "rubrica_contatti_update" on public.rubrica_contatti
  for update to authenticated
  using (public.has_area_access('amministrazione') or public.is_superadmin())
  with check (public.has_area_access('amministrazione') or public.is_superadmin());

grant select, insert, update on public.rubrica_contatti to authenticated;

-- ---------------------------------------------------------------------------
-- Link referenti ↔ possibili clienti
-- ---------------------------------------------------------------------------
create table if not exists public.clienti_possibili_referenti (
  id uuid primary key default gen_random_uuid(),
  cliente_possibile_id uuid not null
    references public.clienti_possibili (id) on delete cascade,
  contatto_id uuid not null
    references public.rubrica_contatti (id) on delete cascade,
  created_at timestamptz not null default now(),
  created_by uuid references auth.users (id) on delete set null,
  unique (cliente_possibile_id, contatto_id)
);

create index if not exists clienti_possibili_referenti_lead_idx
  on public.clienti_possibili_referenti (cliente_possibile_id);
create index if not exists clienti_possibili_referenti_contatto_idx
  on public.clienti_possibili_referenti (contatto_id);

alter table public.clienti_possibili_referenti enable row level security;
create policy "clienti_possibili_referenti_select"
  on public.clienti_possibili_referenti
  for select to authenticated
  using (public.has_area_access('amministrazione') or public.is_superadmin());
create policy "clienti_possibili_referenti_insert"
  on public.clienti_possibili_referenti
  for insert to authenticated
  with check (public.has_area_access('amministrazione') or public.is_superadmin());
create policy "clienti_possibili_referenti_update"
  on public.clienti_possibili_referenti
  for update to authenticated
  using (public.has_area_access('amministrazione') or public.is_superadmin())
  with check (public.has_area_access('amministrazione') or public.is_superadmin());
create policy "clienti_possibili_referenti_delete"
  on public.clienti_possibili_referenti
  for delete to authenticated
  using (public.has_area_access('amministrazione') or public.is_superadmin());

grant select, insert, update, delete on public.clienti_possibili_referenti
  to authenticated;

-- ---------------------------------------------------------------------------
-- Timeline interazioni contatto (fase 2)
-- ---------------------------------------------------------------------------
create table if not exists public.rubrica_timeline (
  id uuid primary key default gen_random_uuid(),
  contatto_id uuid not null
    references public.rubrica_contatti (id) on delete cascade,
  occurred_at timestamptz not null default now(),
  riassunto text not null default '',
  argomenti text not null default '',
  descrizione text not null default '',
  modalita text not null
    check (modalita in ('chiamata', 'messaggi', 'mail', 'incontro')),
  maps_url text not null default '',
  webmail_message_id uuid,
  linked_promemoria_id uuid,
  linked_attivita_id uuid,
  linked_nota_id uuid,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  created_by uuid references auth.users (id) on delete set null,
  updated_by uuid references auth.users (id) on delete set null,
  deleted_at timestamptz,
  deleted_by uuid references auth.users (id) on delete set null,
  constraint rubrica_timeline_riassunto_len check (
    char_length(trim(riassunto)) >= 1 and char_length(riassunto) <= 2000
  )
);

create index if not exists rubrica_timeline_contatto_idx
  on public.rubrica_timeline (contatto_id, occurred_at desc)
  where deleted_at is null;

drop trigger if exists rubrica_timeline_updated_at on public.rubrica_timeline;
create trigger rubrica_timeline_updated_at
  before update on public.rubrica_timeline
  for each row execute function public.set_updated_at();

alter table public.rubrica_timeline enable row level security;
create policy "rubrica_timeline_select" on public.rubrica_timeline
  for select to authenticated
  using (
    deleted_at is null
    and (public.has_area_access('amministrazione') or public.is_superadmin())
  );
create policy "rubrica_timeline_insert" on public.rubrica_timeline
  for insert to authenticated
  with check (public.has_area_access('amministrazione') or public.is_superadmin());
create policy "rubrica_timeline_update" on public.rubrica_timeline
  for update to authenticated
  using (public.has_area_access('amministrazione') or public.is_superadmin())
  with check (public.has_area_access('amministrazione') or public.is_superadmin());

grant select, insert, update on public.rubrica_timeline to authenticated;
