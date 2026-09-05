-- Catalogo titoli certificati + date rilascio/scadenza + stato in forza operatore.
-- ISO 9001 7.5 (documenti) / 6.1 (rischio competenze) / 8.5.2 (tracciabilità).

create table if not exists public.organigramma_certificati_catalogo (
  id uuid primary key default gen_random_uuid(),
  codice text not null,
  nome text not null,
  descrizione text not null default '',
  validita_anni_default integer not null default 5
    check (validita_anni_default between 1 and 30),
  documento_stato text not null default 'approvato'
    check (documento_stato in ('bozza', 'approvato')),
  versione integer not null default 1,
  created_by uuid references auth.users (id) on delete set null,
  updated_by uuid references auth.users (id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz,
  deleted_by uuid references auth.users (id) on delete set null
);

create unique index if not exists organigramma_cert_cat_nome_uidx
  on public.organigramma_certificati_catalogo (lower(nome))
  where deleted_at is null;

create unique index if not exists organigramma_cert_cat_codice_uidx
  on public.organigramma_certificati_catalogo (lower(codice))
  where deleted_at is null;

drop trigger if exists organigramma_cert_cat_updated_at
  on public.organigramma_certificati_catalogo;
create trigger organigramma_cert_cat_updated_at
  before update on public.organigramma_certificati_catalogo
  for each row execute function public.set_updated_at();

alter table public.organigramma_certificati_catalogo enable row level security;
drop policy if exists organigramma_cert_cat_select
  on public.organigramma_certificati_catalogo;
create policy organigramma_cert_cat_select
  on public.organigramma_certificati_catalogo for select to authenticated
  using (
    public.has_area_access('amministrazione') or public.is_superadmin()
  );
drop policy if exists organigramma_cert_cat_write
  on public.organigramma_certificati_catalogo;
create policy organigramma_cert_cat_write
  on public.organigramma_certificati_catalogo for insert to authenticated
  with check (public.is_admin() or public.is_superadmin());
drop policy if exists organigramma_cert_cat_update
  on public.organigramma_certificati_catalogo;
create policy organigramma_cert_cat_update
  on public.organigramma_certificati_catalogo for update to authenticated
  using (public.is_admin() or public.is_superadmin())
  with check (public.is_admin() or public.is_superadmin());

grant select on table public.organigramma_certificati_catalogo to authenticated;
grant insert, update on table public.organigramma_certificati_catalogo to authenticated;
grant all on table public.organigramma_certificati_catalogo to postgres, service_role;
revoke delete on table public.organigramma_certificati_catalogo from authenticated;

alter table public.organigramma_persone
  add column if not exists in_forza boolean not null default true;
alter table public.organigramma_persone
  add column if not exists cessato_at timestamptz;
alter table public.organigramma_persone
  add column if not exists cessato_by uuid references auth.users (id) on delete set null;

comment on column public.organigramma_persone.in_forza is
  'true = opera in azienda. Se false, niente avvisi scadenza certificati.';

alter table public.organigramma_documenti
  add column if not exists certificato_catalogo_id uuid
  references public.organigramma_certificati_catalogo (id) on delete set null;
alter table public.organigramma_documenti
  add column if not exists data_rilascio date;
alter table public.organigramma_documenti
  add column if not exists validita_anni integer
  check (validita_anni is null or validita_anni between 1 and 30);
alter table public.organigramma_documenti
  add column if not exists data_scadenza date;

create index if not exists organigramma_documenti_scadenza_idx
  on public.organigramma_documenti (data_scadenza, certificato_catalogo_id)
  where deleted_at is null and data_scadenza is not null;

comment on column public.organigramma_documenti.data_scadenza is
  'Calcolata da data_rilascio + validita_anni. Avvisi 6 mesi, 3 mesi, poi mensili.';
