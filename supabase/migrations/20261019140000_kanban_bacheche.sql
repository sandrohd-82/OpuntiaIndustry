-- Bacheche di Promemoria e note. ISO 9001: audit, soft archive, storico non modificabile.

create or replace function public.kb_can()
returns boolean
language sql
stable
as $$
  select public.has_area_access('promemorie-e-note') or public.is_superadmin();
$$;

create table if not exists public.kb_bacheche (
  id uuid primary key default gen_random_uuid(),
  titolo text not null,
  descrizione text not null default '',
  documento_stato text not null default 'approvato',
  versione integer not null default 1,
  etichette_estese boolean not null default false,
  archived_at timestamptz,
  purged_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  created_by uuid,
  updated_by uuid,
  deleted_at timestamptz,
  deleted_by uuid,
  constraint kb_bacheche_titolo_len check (char_length(trim(titolo)) between 1 and 160),
  constraint kb_bacheche_documento_check check (documento_stato in ('bozza', 'approvato', 'chiuso'))
);

create table if not exists public.kb_liste (
  id uuid primary key default gen_random_uuid(),
  bacheca_id uuid not null references public.kb_bacheche (id),
  titolo text not null,
  sort_order integer not null default 0,
  archived_at timestamptz,
  purged_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  created_by uuid,
  updated_by uuid,
  deleted_at timestamptz,
  deleted_by uuid,
  constraint kb_liste_titolo_len check (char_length(trim(titolo)) between 1 and 160)
);

create table if not exists public.kb_etichette (
  id uuid primary key default gen_random_uuid(),
  bacheca_id uuid not null references public.kb_bacheche (id),
  nome text not null,
  colore text not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  created_by uuid,
  updated_by uuid,
  deleted_at timestamptz,
  deleted_by uuid,
  constraint kb_etichette_nome_len check (char_length(trim(nome)) between 1 and 40)
);

create table if not exists public.kb_schede (
  id uuid primary key default gen_random_uuid(),
  bacheca_id uuid not null references public.kb_bacheche (id),
  lista_id uuid not null references public.kb_liste (id),
  titolo text not null,
  descrizione text not null default '',
  is_template boolean not null default false,
  template_id uuid,
  inizio_at timestamptz,
  scadenza_at timestamptz,
  scadenza_completata boolean not null default false,
  anticipo text not null default '',
  copertina_colore text not null default '',
  copertina_path text not null default '',
  sort_order integer not null default 0,
  documento_stato text not null default 'approvato',
  versione integer not null default 1,
  archived_at timestamptz,
  purged_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  created_by uuid,
  updated_by uuid,
  deleted_at timestamptz,
  deleted_by uuid,
  constraint kb_schede_titolo_len check (char_length(trim(titolo)) between 1 and 240),
  constraint kb_schede_anticipo_check check (
    anticipo in ('', 'alla_scadenza', '15m', '1h', '1d', '2d')
  ),
  constraint kb_schede_documento_check check (documento_stato in ('bozza', 'approvato', 'chiuso'))
);

create table if not exists public.kb_scheda_etichette (
  scheda_id uuid not null references public.kb_schede (id),
  etichetta_id uuid not null references public.kb_etichette (id),
  created_at timestamptz not null default now(),
  created_by uuid,
  primary key (scheda_id, etichetta_id)
);

create table if not exists public.kb_scheda_membri (
  scheda_id uuid not null references public.kb_schede (id),
  user_id uuid not null,
  created_at timestamptz not null default now(),
  created_by uuid,
  primary key (scheda_id, user_id)
);

create table if not exists public.kb_seguaci (
  scheda_id uuid not null references public.kb_schede (id),
  user_id uuid not null,
  created_at timestamptz not null default now(),
  created_by uuid,
  primary key (scheda_id, user_id)
);

create table if not exists public.kb_checklist (
  id uuid primary key default gen_random_uuid(),
  scheda_id uuid not null references public.kb_schede (id),
  titolo text not null,
  sort_order integer not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  created_by uuid,
  updated_by uuid,
  deleted_at timestamptz,
  deleted_by uuid,
  constraint kb_checklist_titolo_len check (char_length(trim(titolo)) between 1 and 160)
);

create table if not exists public.kb_checklist_voci (
  id uuid primary key default gen_random_uuid(),
  checklist_id uuid not null references public.kb_checklist (id),
  testo text not null,
  fatto boolean not null default false,
  scadenza_at timestamptz,
  assegnato_id uuid,
  sort_order integer not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  created_by uuid,
  updated_by uuid,
  deleted_at timestamptz,
  deleted_by uuid,
  constraint kb_checklist_voci_testo_len check (char_length(trim(testo)) between 1 and 400)
);

create table if not exists public.kb_allegati (
  id uuid primary key default gen_random_uuid(),
  scheda_id uuid not null references public.kb_schede (id),
  storage_path text not null,
  file_name text not null,
  content_type text not null,
  byte_size integer not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  created_by uuid,
  updated_by uuid,
  deleted_at timestamptz,
  deleted_by uuid,
  constraint kb_allegati_size_check check (byte_size > 0 and byte_size <= 15728640),
  constraint kb_allegati_mime_check check (
    content_type in ('application/pdf', 'image/jpeg', 'image/png', 'image/webp')
  )
);

create table if not exists public.kb_commenti (
  id uuid primary key default gen_random_uuid(),
  scheda_id uuid not null references public.kb_schede (id),
  testo text not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  created_by uuid,
  updated_by uuid,
  deleted_at timestamptz,
  deleted_by uuid,
  constraint kb_commenti_testo_len check (char_length(trim(testo)) between 1 and 4000)
);

create table if not exists public.kb_commento_reazioni (
  id uuid primary key default gen_random_uuid(),
  commento_id uuid not null references public.kb_commenti (id),
  user_id uuid not null,
  emoji text not null,
  created_at timestamptz not null default now(),
  created_by uuid,
  constraint kb_reazioni_emoji_check check (emoji in ('👍', '✅', '👀', '❤️')),
  constraint kb_reazioni_unique unique (commento_id, user_id, emoji)
);

create table if not exists public.kb_storico (
  id uuid primary key default gen_random_uuid(),
  bacheca_id uuid not null,
  scheda_id uuid,
  actor_id uuid,
  summary text not null,
  created_at timestamptz not null default now()
);

create table if not exists public.kb_promemoria (
  id uuid primary key default gen_random_uuid(),
  scheda_id uuid not null references public.kb_schede (id),
  notify_at timestamptz not null,
  sent_at timestamptz,
  destinatario_id uuid,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  created_by uuid,
  updated_by uuid,
  deleted_at timestamptz,
  deleted_by uuid
);

create index if not exists kb_liste_bacheca_idx on public.kb_liste (bacheca_id) where deleted_at is null;
create index if not exists kb_schede_lista_idx on public.kb_schede (lista_id, sort_order) where deleted_at is null;
create index if not exists kb_schede_bacheca_idx on public.kb_schede (bacheca_id) where deleted_at is null;
create index if not exists kb_promemoria_due_idx on public.kb_promemoria (notify_at) where sent_at is null and deleted_at is null;

drop trigger if exists kb_bacheche_updated_at on public.kb_bacheche;
create trigger kb_bacheche_updated_at before update on public.kb_bacheche
  for each row execute function public.set_updated_at();
drop trigger if exists kb_liste_updated_at on public.kb_liste;
create trigger kb_liste_updated_at before update on public.kb_liste
  for each row execute function public.set_updated_at();
drop trigger if exists kb_etichette_updated_at on public.kb_etichette;
create trigger kb_etichette_updated_at before update on public.kb_etichette
  for each row execute function public.set_updated_at();
drop trigger if exists kb_schede_updated_at on public.kb_schede;
create trigger kb_schede_updated_at before update on public.kb_schede
  for each row execute function public.set_updated_at();
drop trigger if exists kb_checklist_updated_at on public.kb_checklist;
create trigger kb_checklist_updated_at before update on public.kb_checklist
  for each row execute function public.set_updated_at();
drop trigger if exists kb_checklist_voci_updated_at on public.kb_checklist_voci;
create trigger kb_checklist_voci_updated_at before update on public.kb_checklist_voci
  for each row execute function public.set_updated_at();
drop trigger if exists kb_allegati_updated_at on public.kb_allegati;
create trigger kb_allegati_updated_at before update on public.kb_allegati
  for each row execute function public.set_updated_at();
drop trigger if exists kb_commenti_updated_at on public.kb_commenti;
create trigger kb_commenti_updated_at before update on public.kb_commenti
  for each row execute function public.set_updated_at();
drop trigger if exists kb_promemoria_updated_at on public.kb_promemoria;
create trigger kb_promemoria_updated_at before update on public.kb_promemoria
  for each row execute function public.set_updated_at();

do $$
declare t text;
begin
  foreach t in array array[
    'kb_bacheche', 'kb_liste', 'kb_etichette', 'kb_schede', 'kb_scheda_etichette',
    'kb_scheda_membri', 'kb_seguaci', 'kb_checklist', 'kb_checklist_voci',
    'kb_allegati', 'kb_commenti', 'kb_commento_reazioni', 'kb_promemoria'
  ]
  loop
    execute format('alter table public.%I enable row level security', t);
    execute format('drop policy if exists %I on public.%I', t || '_select', t);
    execute format('create policy %I on public.%I for select to authenticated using (public.kb_can())', t || '_select', t);
    execute format('drop policy if exists %I on public.%I', t || '_write', t);
    execute format('create policy %I on public.%I for all to authenticated using (public.kb_can()) with check (public.kb_can())', t || '_write', t);
    execute format('grant select, insert, update on table public.%I to authenticated', t);
    execute format('grant all on table public.%I to postgres, service_role', t);
    execute format('revoke delete on table public.%I from authenticated', t);
  end loop;
end $$;

alter table public.kb_storico enable row level security;
drop policy if exists kb_storico_select on public.kb_storico;
create policy kb_storico_select on public.kb_storico for select to authenticated using (public.kb_can());
drop policy if exists kb_storico_insert on public.kb_storico;
create policy kb_storico_insert on public.kb_storico for insert to authenticated with check (public.kb_can());
grant select, insert on table public.kb_storico to authenticated;
grant all on table public.kb_storico to postgres, service_role;
revoke update, delete on table public.kb_storico from authenticated;

grant delete on table public.kb_scheda_etichette to authenticated;
grant delete on table public.kb_scheda_membri to authenticated;
grant delete on table public.kb_seguaci to authenticated;
grant delete on table public.kb_commento_reazioni to authenticated;

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'kb-bacheche',
  'kb-bacheche',
  false,
  15728640,
  array['application/pdf', 'image/jpeg', 'image/png', 'image/webp']::text[]
)
on conflict (id) do update set
  public = false,
  file_size_limit = excluded.file_size_limit,
  allowed_mime_types = excluded.allowed_mime_types;

drop policy if exists "kb_bacheche_storage_select" on storage.objects;
create policy "kb_bacheche_storage_select"
  on storage.objects for select to authenticated
  using (bucket_id = 'kb-bacheche' and public.kb_can());

drop policy if exists "kb_bacheche_storage_insert" on storage.objects;
create policy "kb_bacheche_storage_insert"
  on storage.objects for insert to authenticated
  with check (bucket_id = 'kb-bacheche' and public.kb_can());
