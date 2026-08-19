-- Webmail Option A: assegnazione caselle per operatore (ISO 9001)
-- Superadmin / Amministrazione: tutte le caselle.
-- Operatori commerciale: solo caselle con grant attivo.

create table if not exists public.webmail_account_grants (
  id uuid primary key default gen_random_uuid(),
  account_id uuid not null references public.webmail_accounts (id) on delete cascade,
  user_id uuid not null references auth.users (id) on delete cascade,
  can_send boolean not null default true,
  created_by uuid references auth.users (id) on delete set null,
  updated_by uuid references auth.users (id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz,
  deleted_by uuid references auth.users (id) on delete set null
);

create unique index if not exists webmail_account_grants_active_uidx
  on public.webmail_account_grants (account_id, user_id)
  where deleted_at is null;

create index if not exists webmail_account_grants_user_idx
  on public.webmail_account_grants (user_id)
  where deleted_at is null;

drop trigger if exists webmail_account_grants_updated_at on public.webmail_account_grants;
create trigger webmail_account_grants_updated_at
  before update on public.webmail_account_grants
  for each row execute function public.set_updated_at();

alter table public.webmail_account_grants enable row level security;

drop policy if exists "webmail_account_grants_select" on public.webmail_account_grants;
create policy "webmail_account_grants_select"
  on public.webmail_account_grants for select to authenticated
  using (
    public.is_superadmin()
    or public.has_area_access('amministrazione')
    or user_id = auth.uid()
  );

drop policy if exists "webmail_account_grants_write" on public.webmail_account_grants;
create policy "webmail_account_grants_write"
  on public.webmail_account_grants for all to authenticated
  using (public.is_superadmin() or public.has_area_access('amministrazione'))
  with check (public.is_superadmin() or public.has_area_access('amministrazione'));

grant select on table public.webmail_account_grants to authenticated;
grant insert, update on table public.webmail_account_grants to authenticated;
grant all on table public.webmail_account_grants to postgres, service_role;
revoke delete on table public.webmail_account_grants from authenticated;

create or replace function public.can_access_webmail_account(p_account_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select
    public.is_superadmin()
    or public.has_area_access('amministrazione')
    or exists (
      select 1
      from public.webmail_account_grants g
      where g.account_id = p_account_id
        and g.user_id = auth.uid()
        and g.deleted_at is null
    );
$$;

comment on function public.can_access_webmail_account(uuid) is
  'ISO: accesso casella webmail per superadmin/amministrazione oppure grant operatore.';

grant execute on function public.can_access_webmail_account(uuid) to authenticated;

-- Accounts: restringi select alle caselle accessibili
drop policy if exists "webmail_accounts_select" on public.webmail_accounts;
create policy "webmail_accounts_select"
  on public.webmail_accounts for select to authenticated
  using (
    deleted_at is null
    and public.can_access_webmail_account(id)
  );

drop policy if exists "webmail_accounts_write" on public.webmail_accounts;
create policy "webmail_accounts_write"
  on public.webmail_accounts for all to authenticated
  using (public.is_superadmin() or public.has_area_access('amministrazione'))
  with check (public.is_superadmin() or public.has_area_access('amministrazione'));

-- Messaggi / bozze / allegati / elaborazioni filtrati per casella
drop policy if exists "webmail_messaggi_all" on public.webmail_messaggi;
create policy "webmail_messaggi_all"
  on public.webmail_messaggi for all to authenticated
  using (public.can_access_webmail_account(account_id))
  with check (public.can_access_webmail_account(account_id));

drop policy if exists "webmail_bozze_ai_all" on public.webmail_bozze_ai;
create policy "webmail_bozze_ai_all"
  on public.webmail_bozze_ai for all to authenticated
  using (public.can_access_webmail_account(account_id))
  with check (public.can_access_webmail_account(account_id));

drop policy if exists "webmail_bozze_allegati_all" on public.webmail_bozze_allegati;
create policy "webmail_bozze_allegati_all"
  on public.webmail_bozze_allegati for all to authenticated
  using (
    exists (
      select 1
      from public.webmail_bozze_ai b
      where b.id = webmail_bozze_allegati.bozza_id
        and public.can_access_webmail_account(b.account_id)
    )
  )
  with check (
    exists (
      select 1
      from public.webmail_bozze_ai b
      where b.id = webmail_bozze_allegati.bozza_id
        and public.can_access_webmail_account(b.account_id)
    )
  );

drop policy if exists "webmail_ai_elaborazioni_all" on public.webmail_ai_elaborazioni;
create policy "webmail_ai_elaborazioni_all"
  on public.webmail_ai_elaborazioni for all to authenticated
  using (
    account_id is null
    or public.can_access_webmail_account(account_id)
  )
  with check (
    account_id is null
    or public.can_access_webmail_account(account_id)
  );

-- Seed: assegna le caselle esistenti al creatore (se presente)
insert into public.webmail_account_grants (account_id, user_id, can_send, created_by)
select a.id, a.created_by, true, a.created_by
from public.webmail_accounts a
where a.deleted_at is null
  and a.created_by is not null
  and not exists (
    select 1
    from public.webmail_account_grants g
    where g.account_id = a.id
      and g.user_id = a.created_by
      and g.deleted_at is null
  );
