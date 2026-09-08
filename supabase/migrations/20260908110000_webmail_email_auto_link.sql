-- Collegamento automatico mittente → cliente / possibile cliente (ISO 9001).
-- Soft delete: mai cancellazione fisica. Audit su created_by / updated_by.

create table if not exists public.webmail_email_anagrafica_auto_link (
  id uuid primary key default gen_random_uuid(),
  email_normalized text not null,
  azienda_tipo text not null
    check (azienda_tipo in ('cliente', 'cliente_possibile')),
  azienda_id uuid not null,
  azienda_label text not null default '',
  contatto_id uuid references public.rubrica_contatti (id) on delete set null,
  created_by uuid references auth.users (id) on delete set null,
  updated_by uuid references auth.users (id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz,
  deleted_by uuid references auth.users (id) on delete set null
);

comment on table public.webmail_email_anagrafica_auto_link is
  'Regola confermata dall''operatore: ad ogni sync le mail da questo indirizzo si collegano all''anagrafica.';

create unique index if not exists webmail_email_anagrafica_auto_link_email_uidx
  on public.webmail_email_anagrafica_auto_link (email_normalized)
  where deleted_at is null;

drop trigger if exists webmail_email_anagrafica_auto_link_updated_at
  on public.webmail_email_anagrafica_auto_link;
create trigger webmail_email_anagrafica_auto_link_updated_at
  before update on public.webmail_email_anagrafica_auto_link
  for each row execute function public.set_updated_at();

alter table public.webmail_email_anagrafica_auto_link enable row level security;

drop policy if exists webmail_email_anagrafica_auto_link_all
  on public.webmail_email_anagrafica_auto_link;
create policy webmail_email_anagrafica_auto_link_all
  on public.webmail_email_anagrafica_auto_link for all to authenticated
  using (
    public.has_area_access('webmail')
    or public.has_area_access('amministrazione')
    or public.has_area_access('commerciale')
    or public.is_superadmin()
  )
  with check (
    public.has_area_access('webmail')
    or public.has_area_access('amministrazione')
    or public.has_area_access('commerciale')
    or public.is_superadmin()
  );

grant select, insert, update on table public.webmail_email_anagrafica_auto_link
  to authenticated;
grant all on table public.webmail_email_anagrafica_auto_link
  to postgres, service_role;
revoke delete on table public.webmail_email_anagrafica_auto_link from authenticated;
