-- Recupero password (approvazione Super Admin) + tipo notifica sicurezza.
-- ISO 9001: audit, soft delete, stati, chi/quando, token solo in hash.

alter table public.app_notifiche drop constraint if exists app_notifiche_tipo_check;
alter table public.app_notifiche
  add constraint app_notifiche_tipo_check
  check (tipo in (
    'attivita',
    'webmail',
    'sistema',
    'chat',
    'scadenza',
    'avviso',
    'sicurezza'
  ));

create table if not exists public.password_reset_richieste (
  id uuid primary key default gen_random_uuid(),
  richiedente_id uuid not null references auth.users (id) on delete cascade,
  richiedente_email text not null,
  richiedente_nome text not null default '',
  richiedente_tipo text not null
    check (richiedente_tipo in ('operatore', 'superadmin')),
  stato text not null default 'in_attesa'
    check (stato in ('in_attesa', 'approvata', 'rifiutata', 'scaduta', 'usata')),
  versione integer not null default 1,
  decisa_da uuid references auth.users (id) on delete set null,
  decisa_at timestamptz,
  approvazione_token_hash text,
  approvazione_expires_at timestamptz,
  reset_token_hash text,
  reset_expires_at timestamptz,
  note text not null default '',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  created_by uuid references auth.users (id) on delete set null,
  updated_by uuid references auth.users (id) on delete set null,
  deleted_at timestamptz,
  deleted_by uuid references auth.users (id) on delete set null,
  constraint password_reset_email_len check (char_length(trim(richiedente_email)) between 3 and 200),
  constraint password_reset_note_len check (char_length(note) <= 800)
);

create unique index if not exists password_reset_pending_uidx
  on public.password_reset_richieste (richiedente_id)
  where deleted_at is null and stato = 'in_attesa';

create index if not exists password_reset_stato_idx
  on public.password_reset_richieste (stato, created_at desc)
  where deleted_at is null;

create unique index if not exists password_reset_approvazione_hash_uidx
  on public.password_reset_richieste (approvazione_token_hash)
  where approvazione_token_hash is not null and deleted_at is null;

create unique index if not exists password_reset_reset_hash_uidx
  on public.password_reset_richieste (reset_token_hash)
  where reset_token_hash is not null and deleted_at is null;

drop trigger if exists password_reset_richieste_updated_at
  on public.password_reset_richieste;
create trigger password_reset_richieste_updated_at
  before update on public.password_reset_richieste
  for each row execute function public.set_updated_at();

comment on table public.password_reset_richieste is
  'Richieste recupero password. Basta un Super Admin per approvare. Soft delete, audit, token in hash.';

alter table public.password_reset_richieste enable row level security;

drop policy if exists "password_reset_select_own_or_sa" on public.password_reset_richieste;
create policy "password_reset_select_own_or_sa"
  on public.password_reset_richieste for select to authenticated
  using (
    deleted_at is null
    and (
      richiedente_id = auth.uid()
      or public.is_superadmin()
    )
  );

drop policy if exists "password_reset_update_sa" on public.password_reset_richieste;
create policy "password_reset_update_sa"
  on public.password_reset_richieste for update to authenticated
  using (public.is_superadmin())
  with check (public.is_superadmin());

grant select, update on public.password_reset_richieste to authenticated;
grant all on public.password_reset_richieste to postgres, service_role;
revoke insert, delete on public.password_reset_richieste from authenticated;

notify pgrst, 'reload schema';
