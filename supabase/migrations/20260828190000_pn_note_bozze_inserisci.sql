-- Bozze nota standard (template con placeholder) — ISO 9001
-- + arricchimento pn_note (bozza_id, body_rich, allegati)

create table if not exists public.pn_note_bozze (
  id uuid primary key default gen_random_uuid(),
  titolo_bozza text not null,
  titolo_nota text not null default '',
  body_template text not null default '',
  /** [{ "key":"campo_1","label":"Nome azienda","sample":"Acme Srl" }, ...] */
  placeholders jsonb not null default '[]'::jsonb,
  versione integer not null default 1 check (versione >= 1),
  documento_stato text not null default 'bozza'
    check (documento_stato in ('bozza', 'approvata', 'archiviata')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  created_by uuid references auth.users (id) on delete set null,
  updated_by uuid references auth.users (id) on delete set null,
  deleted_at timestamptz,
  deleted_by uuid references auth.users (id) on delete set null
);

create index if not exists pn_note_bozze_stato_idx
  on public.pn_note_bozze (documento_stato)
  where deleted_at is null;

drop trigger if exists pn_note_bozze_updated_at on public.pn_note_bozze;
create trigger pn_note_bozze_updated_at
  before update on public.pn_note_bozze
  for each row execute function public.set_updated_at();

alter table public.pn_note_bozze enable row level security;

drop policy if exists "pn_note_bozze_select" on public.pn_note_bozze;
create policy "pn_note_bozze_select" on public.pn_note_bozze
  for select to authenticated
  using (
    deleted_at is null
    and (
      public.is_superadmin()
      or public.has_area_access('promemorie-e-note')
      or public.has_area_access('amministrazione')
    )
  );

drop policy if exists "pn_note_bozze_insert" on public.pn_note_bozze;
create policy "pn_note_bozze_insert" on public.pn_note_bozze
  for insert to authenticated
  with check (
    public.is_superadmin()
    or public.has_area_access('promemorie-e-note')
    or public.has_area_access('amministrazione')
  );

drop policy if exists "pn_note_bozze_update" on public.pn_note_bozze;
create policy "pn_note_bozze_update" on public.pn_note_bozze
  for update to authenticated
  using (
    public.is_superadmin()
    or public.has_area_access('promemorie-e-note')
    or public.has_area_access('amministrazione')
  )
  with check (
    public.is_superadmin()
    or public.has_area_access('promemorie-e-note')
    or public.has_area_access('amministrazione')
  );

grant select, insert, update on public.pn_note_bozze to authenticated;
grant all on public.pn_note_bozze to postgres, service_role;
revoke delete on public.pn_note_bozze from authenticated;

comment on table public.pn_note_bozze is
  'Template nota standard con campi variabili (placeholder) — ISO 7.5 / 8.5.2';
comment on column public.pn_note_bozze.titolo_bozza is
  'Nome della bozza (catalogo template), distinto dal titolo nota';
comment on column public.pn_note_bozze.placeholders is
  'Campi evidenziati in revisione: key, label, sample';

alter table public.pn_note
  add column if not exists bozza_id uuid references public.pn_note_bozze (id) on delete set null;

alter table public.pn_note
  add column if not exists body_rich text not null default '';

alter table public.pn_note
  add column if not exists allegati jsonb not null default '[]'::jsonb;

create index if not exists pn_note_bozza_id_idx
  on public.pn_note (bozza_id)
  where deleted_at is null and bozza_id is not null;

comment on column public.pn_note.body_rich is
  'Corpo con markdown leggero (link [testo](url)); body resta testo piano';
comment on column public.pn_note.allegati is
  'Allegati [{id,kind,label,url,storagePath}]';
comment on column public.pn_note.bozza_id is
  'Bozza template usata all''origine (nota resta editabile)';
