-- PDF emesso con ogni invio del preventivo. Una riga per spedizione.
-- Dopo lo stato «inviato» la riga non si modifica e non si elimina.

create table if not exists public.preventivi_documenti_emessi (
  id uuid primary key,
  preventivo_id uuid not null
    references public.preventivi (id) on delete restrict,
  versione integer not null,
  stato text not null default 'preparato',
  documento_stato text not null default 'bozza',
  storage_bucket text not null default 'preventivi-pdf',
  storage_path text not null,
  filename text not null,
  mime_type text not null default 'application/pdf',
  size_bytes integer not null default 0,
  sha256 text not null default '',
  mail_to text not null default '',
  mail_oggetto text not null default '',
  mail_message_id text not null default '',
  inviato_at timestamptz,
  inviato_by uuid references auth.users (id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  created_by uuid references auth.users (id) on delete set null,
  updated_by uuid references auth.users (id) on delete set null,
  deleted_at timestamptz,
  deleted_by uuid references auth.users (id) on delete set null,
  constraint preventivi_doc_emessi_versione_check check (versione >= 1),
  constraint preventivi_doc_emessi_stato_check check (
    stato in ('preparato', 'inviato')
  ),
  constraint preventivi_doc_emessi_documento_check check (
    documento_stato in ('bozza', 'approvato', 'chiuso')
  ),
  constraint preventivi_doc_emessi_size_check check (size_bytes >= 0)
);

comment on table public.preventivi_documenti_emessi is
  'PDF del preventivo allegato a ogni invio. La riga inviata è immutabile (ISO 9001 §7.5).';

create unique index if not exists preventivi_doc_emessi_versione_uidx
  on public.preventivi_documenti_emessi (preventivo_id, versione)
  where deleted_at is null;

create unique index if not exists preventivi_doc_emessi_preparato_uidx
  on public.preventivi_documenti_emessi (preventivo_id)
  where deleted_at is null and stato = 'preparato';

create index if not exists preventivi_doc_emessi_preventivo_idx
  on public.preventivi_documenti_emessi (preventivo_id, versione)
  where deleted_at is null;

drop trigger if exists preventivi_doc_emessi_updated_at
  on public.preventivi_documenti_emessi;
create trigger preventivi_doc_emessi_updated_at
  before update on public.preventivi_documenti_emessi
  for each row execute function public.set_updated_at();

create or replace function public.preventivi_documenti_emessi_immutabile()
returns trigger
language plpgsql
as $$
begin
  if tg_op = 'DELETE' then
    if old.stato = 'inviato' then
      raise exception 'Il PDF inviato di un preventivo non si elimina';
    end if;
    return old;
  end if;
  if old.stato = 'inviato' then
    raise exception 'Il PDF inviato di un preventivo non si modifica';
  end if;
  return new;
end;
$$;

drop trigger if exists preventivi_doc_emessi_immutabile
  on public.preventivi_documenti_emessi;
create trigger preventivi_doc_emessi_immutabile
  before update or delete on public.preventivi_documenti_emessi
  for each row execute function public.preventivi_documenti_emessi_immutabile();

alter table public.preventivi_documenti_emessi enable row level security;

drop policy if exists "preventivi_doc_emessi_select"
  on public.preventivi_documenti_emessi;
create policy "preventivi_doc_emessi_select"
  on public.preventivi_documenti_emessi for select to authenticated
  using (
    public.has_area_access('amministrazione')
    or public.has_area_access('commerciale')
    or public.is_superadmin()
  );

drop policy if exists "preventivi_doc_emessi_write"
  on public.preventivi_documenti_emessi;
create policy "preventivi_doc_emessi_write"
  on public.preventivi_documenti_emessi for all to authenticated
  using (
    public.has_area_access('amministrazione')
    or public.has_area_access('commerciale')
    or public.is_superadmin()
  )
  with check (
    public.has_area_access('amministrazione')
    or public.has_area_access('commerciale')
    or public.is_superadmin()
  );

grant select, insert, update on table public.preventivi_documenti_emessi to authenticated;
grant all on table public.preventivi_documenti_emessi to postgres, service_role;
revoke delete on table public.preventivi_documenti_emessi from authenticated;

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'preventivi-pdf',
  'preventivi-pdf',
  false,
  7340032,
  array['application/pdf']::text[]
)
on conflict (id) do update set
  public = false,
  file_size_limit = excluded.file_size_limit,
  allowed_mime_types = excluded.allowed_mime_types;

drop policy if exists "preventivi_pdf_storage_select" on storage.objects;
create policy "preventivi_pdf_storage_select"
  on storage.objects for select to authenticated
  using (
    bucket_id = 'preventivi-pdf'
    and (
      public.has_area_access('amministrazione')
      or public.has_area_access('commerciale')
      or public.is_superadmin()
    )
  );

drop policy if exists "preventivi_pdf_storage_insert" on storage.objects;
create policy "preventivi_pdf_storage_insert"
  on storage.objects for insert to authenticated
  with check (
    bucket_id = 'preventivi-pdf'
    and (
      public.has_area_access('amministrazione')
      or public.has_area_access('commerciale')
      or public.is_superadmin()
    )
  );
