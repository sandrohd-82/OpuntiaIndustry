-- Documenti di un acquisto del caveau siti. File nello storage privato.
-- Accesso solo Super Admin, tramite service role. Nessun download pubblico.

create table if not exists public.caveau_siti_acquisto_documenti (
  id uuid primary key default gen_random_uuid(),
  acquisto_id uuid not null references public.caveau_siti_acquisti (id),
  nome text not null,
  storage_path text not null,
  file_name text not null,
  mime text not null default '',
  file_size integer not null default 0,
  versione integer not null default 1,
  documento_stato text not null default 'registrato',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  created_by uuid,
  updated_by uuid,
  deleted_at timestamptz,
  deleted_by uuid,
  constraint caveau_acq_doc_nome_non_vuoto check (char_length(btrim(nome)) > 0),
  constraint caveau_acq_doc_path_non_vuoto check (char_length(btrim(storage_path)) > 0),
  constraint caveau_acq_doc_file_non_vuoto check (char_length(btrim(file_name)) > 0),
  constraint caveau_acq_doc_size_non_negativo check (file_size >= 0),
  constraint caveau_acq_doc_versione_positiva check (versione >= 1),
  constraint caveau_acq_doc_stato check (documento_stato in ('registrato', 'archiviato'))
);

create index if not exists caveau_siti_acquisto_documenti_vivi_idx
  on public.caveau_siti_acquisto_documenti (acquisto_id, created_at)
  where deleted_at is null;

drop trigger if exists caveau_siti_acquisto_documenti_set_updated_at
  on public.caveau_siti_acquisto_documenti;
create trigger caveau_siti_acquisto_documenti_set_updated_at
  before update on public.caveau_siti_acquisto_documenti
  for each row execute function public.set_updated_at();

alter table public.caveau_siti_acquisto_documenti enable row level security;

revoke all on table public.caveau_siti_acquisto_documenti from anon, authenticated;
grant select, insert, update, delete on table public.caveau_siti_acquisto_documenti to service_role;

comment on table public.caveau_siti_acquisto_documenti is
  'Documenti di un acquisto del caveau. Nome dato dall''operatore e file in storage privato. Soft delete.';

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'caveau-siti-documenti',
  'caveau-siti-documenti',
  false,
  15728640,
  array[
    'application/pdf',
    'image/jpeg',
    'image/png',
    'image/webp',
    'application/msword',
    'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    'application/vnd.ms-excel',
    'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'
  ]::text[]
)
on conflict (id) do update set
  public = excluded.public,
  file_size_limit = excluded.file_size_limit,
  allowed_mime_types = excluded.allowed_mime_types;

notify pgrst, 'reload schema';
