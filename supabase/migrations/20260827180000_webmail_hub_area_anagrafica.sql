-- WebMail hub (Opzione A): area menu, ownership caselle, categorie business,
-- collegamento messaggio → azienda + referente (ISO 9001).

-- ---------------------------------------------------------------------------
-- Area webmail + permessi
-- ---------------------------------------------------------------------------
insert into public.areas (slug, name, description, icon, sort_order, is_active)
values (
  'webmail',
  'WebMail',
  'Caselle aziendali, categorie e collegamento anagrafiche',
  'mail',
  47,
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
update public.areas set sort_order = 47 where slug = 'webmail';
update public.areas set sort_order = 50 where slug = 'magazzino';

insert into public.role_area_permissions (role_id, area_id, can_access)
select r.id, a.id, true
from public.app_roles r
cross join public.areas a
where a.slug = 'webmail'
  and r.code in ('superadmin', 'admin', 'manager', 'operator')
on conflict (role_id, area_id) do update set can_access = true;

-- Chi aveva commerciale ottiene anche webmail
insert into public.role_area_permissions (role_id, area_id, can_access)
select rap.role_id, aw.id, true
from public.role_area_permissions rap
join public.areas ac on ac.id = rap.area_id and ac.slug = 'commerciale'
join public.areas aw on aw.slug = 'webmail'
where rap.can_access = true
on conflict (role_id, area_id) do update set can_access = true;

-- ---------------------------------------------------------------------------
-- Ownership casella (organigramma / profilo)
-- ---------------------------------------------------------------------------
alter table public.webmail_accounts
  add column if not exists owner_user_id uuid references auth.users (id) on delete set null;

create index if not exists webmail_accounts_owner_idx
  on public.webmail_accounts (owner_user_id)
  where deleted_at is null and owner_user_id is not null;

comment on column public.webmail_accounts.owner_user_id is
  'Utente organigramma proprietario della casella; null = condivisa via grant.';

-- Backfill owner da profiles.email = casella
update public.webmail_accounts a
set owner_user_id = p.id
from public.profiles p
where a.deleted_at is null
  and a.owner_user_id is null
  and lower(p.email) = lower(a.email_address);

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
      from public.webmail_accounts a
      where a.id = p_account_id
        and a.deleted_at is null
        and a.owner_user_id = auth.uid()
    )
    or exists (
      select 1
      from public.webmail_account_grants g
      where g.account_id = p_account_id
        and g.user_id = auth.uid()
        and g.deleted_at is null
    );
$$;

comment on function public.can_access_webmail_account(uuid) is
  'Accesso casella: superadmin/amministrazione, owner profilo, oppure grant.';

-- ---------------------------------------------------------------------------
-- Categorie business (preventivi, ordini, contatti, info)
-- ---------------------------------------------------------------------------
insert into public.webmail_categorie (codice, nome, descrizione, colore, is_system, sort_order)
select v.codice, v.nome, v.descrizione, v.colore, true, v.sort_order
from (values
  ('preventivi', 'Preventivi', 'Richieste e invio preventivi / listini', '#16a34a', 12),
  ('ordini', 'Ordini', 'Ordini, lotti e conferme', '#ca8a04', 22),
  ('contatti', 'Contatti', 'Primo contatto e presentazioni', '#0ea5e9', 32),
  ('info', 'Info', 'Informazioni generali e schede', '#64748b', 42)
) as v(codice, nome, descrizione, colore, sort_order)
where not exists (
  select 1 from public.webmail_categorie c
  where lower(c.codice) = lower(v.codice) and c.deleted_at is null
);

-- ---------------------------------------------------------------------------
-- Collegamento messaggio → azienda / referente
-- ---------------------------------------------------------------------------
alter table public.webmail_messaggi
  add column if not exists azienda_tipo text
    check (
      azienda_tipo is null
      or azienda_tipo in ('cliente', 'fornitore', 'cliente_possibile')
    );

alter table public.webmail_messaggi
  add column if not exists azienda_id uuid;

alter table public.webmail_messaggi
  add column if not exists azienda_label text not null default '';

alter table public.webmail_messaggi
  add column if not exists contatto_id uuid
    references public.rubrica_contatti (id) on delete set null;

alter table public.webmail_messaggi
  add column if not exists link_stato text not null default 'bozza'
    check (link_stato in ('bozza', 'collegata', 'da_salvare'));

create index if not exists webmail_messaggi_azienda_idx
  on public.webmail_messaggi (azienda_tipo, azienda_id)
  where deleted_at is null and azienda_id is not null;

create index if not exists webmail_messaggi_contatto_idx
  on public.webmail_messaggi (contatto_id)
  where deleted_at is null and contatto_id is not null;

create index if not exists webmail_messaggi_from_email_idx
  on public.webmail_messaggi (lower(from_address))
  where deleted_at is null;

comment on column public.webmail_messaggi.link_stato is
  'Bozza = non collegata; Collegata = anagrafica OK; Da_salvare = match suggerito da creare.';
comment on column public.webmail_messaggi.contatto_id is
  'Referente rubrica mittente, se risolto.';
