-- WebMail: apprendimento categorie (soglie 2/4/6) + campi messaggio ISO 9001.
-- Bozze AI on-demand (nessuna generazione in sync — solo codice app).

-- ---------------------------------------------------------------------------
-- Campi messaggio: suggerimento / auto-categoria
-- ---------------------------------------------------------------------------
alter table public.webmail_messaggi
  add column if not exists categoria_suggest_id uuid
    references public.webmail_categorie (id) on delete set null;

alter table public.webmail_messaggi
  add column if not exists categoria_suggest_mode text;

alter table public.webmail_messaggi
  add column if not exists categoria_auto_applied_at timestamptz;

alter table public.webmail_messaggi
  add column if not exists categoria_auto_pending boolean not null default false;

alter table public.webmail_messaggi
  add column if not exists categoria_auto_notified boolean not null default false;

do $$
begin
  if not exists (
    select 1 from pg_constraint
    where conname = 'webmail_messaggi_categoria_suggest_mode_check'
  ) then
    alter table public.webmail_messaggi
      add constraint webmail_messaggi_categoria_suggest_mode_check
      check (
        categoria_suggest_mode is null
        or categoria_suggest_mode in ('suggest', 'auto_notify', 'auto_silent')
      );
  end if;
end $$;

comment on column public.webmail_messaggi.categoria_suggest_id is
  'Categoria suggerita dall''apprendimento (fase suggest).';
comment on column public.webmail_messaggi.categoria_auto_pending is
  'True se auto-spostata con avviso in attesa conferma operatore.';

-- ---------------------------------------------------------------------------
-- Regole apprendimento mittente/dominio → categoria
-- ---------------------------------------------------------------------------
create table if not exists public.webmail_categoria_regole (
  id uuid primary key default gen_random_uuid(),
  account_id uuid references public.webmail_accounts (id) on delete cascade,
  match_type text not null,
  match_key text not null,
  categoria_id uuid not null references public.webmail_categorie (id) on delete cascade,
  confirm_count integer not null default 0,
  mode text not null default 'learning',
  last_matched_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  created_by uuid references auth.users (id) on delete set null,
  updated_by uuid references auth.users (id) on delete set null,
  deleted_at timestamptz,
  deleted_by uuid references auth.users (id) on delete set null,
  constraint webmail_categoria_regole_match_type_check
    check (match_type in ('email', 'domain')),
  constraint webmail_categoria_regole_mode_check
    check (mode in ('learning', 'suggest', 'auto_notify', 'auto_silent')),
  constraint webmail_categoria_regole_confirm_nonneg
    check (confirm_count >= 0)
);

create unique index if not exists webmail_categoria_regole_uidx
  on public.webmail_categoria_regole (
    coalesce(account_id, '00000000-0000-0000-0000-000000000000'::uuid),
    match_type,
    lower(match_key)
  )
  where deleted_at is null;

create index if not exists webmail_categoria_regole_key_idx
  on public.webmail_categoria_regole (match_type, lower(match_key))
  where deleted_at is null;

drop trigger if exists webmail_categoria_regole_updated_at on public.webmail_categoria_regole;
create trigger webmail_categoria_regole_updated_at
  before update on public.webmail_categoria_regole
  for each row execute function public.set_updated_at();

alter table public.webmail_categoria_regole enable row level security;

drop policy if exists "webmail_categoria_regole_all" on public.webmail_categoria_regole;
create policy "webmail_categoria_regole_all"
  on public.webmail_categoria_regole for all to authenticated
  using (
    public.is_superadmin()
    or public.has_area_access('webmail')
    or public.has_area_access('commerciale')
    or public.has_area_access('amministrazione')
  )
  with check (
    public.is_superadmin()
    or public.has_area_access('webmail')
    or public.has_area_access('commerciale')
    or public.has_area_access('amministrazione')
  );

grant select, insert, update on table public.webmail_categoria_regole to authenticated;
grant all on table public.webmail_categoria_regole to postgres, service_role;

comment on table public.webmail_categoria_regole is
  'Apprendimento categorie: soglie confirm_count 2=suggest, 4=auto_notify, 6=auto_silent.';

-- Operatori WebMail possono creare categorie al volo
drop policy if exists "webmail_categorie_write" on public.webmail_categorie;
create policy "webmail_categorie_write"
  on public.webmail_categorie for all to authenticated
  using (
    public.is_superadmin()
    or public.has_area_access('amministrazione')
    or public.has_area_access('webmail')
    or public.has_area_access('commerciale')
  )
  with check (
    public.is_superadmin()
    or public.has_area_access('amministrazione')
    or public.has_area_access('webmail')
    or public.has_area_access('commerciale')
  );

grant insert, update on table public.webmail_categorie to authenticated;
