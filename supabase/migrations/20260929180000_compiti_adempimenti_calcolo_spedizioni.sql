-- Compiti e adempimenti + preventivo in attesa del calcolo spedizione.
-- ISO 9001: audit, soft delete, chi è incaricato, stato del documento.

alter table public.preventivi drop constraint if exists preventivi_stato_check;
alter table public.preventivi
  add constraint preventivi_stato_check check (
    stato in (
      'creato',
      'in_attesa_spedizione',
      'inviato',
      'accettato',
      'respinto'
    )
  );

alter table public.preventivi
  add column if not exists modalita_spedizione_prezzo text not null default 'non_applicabile',
  add column if not exists mail_bozza_account_id uuid,
  add column if not exists mail_bozza_to text not null default '',
  add column if not exists mail_bozza_oggetto text not null default '',
  add column if not exists mail_bozza_testo text not null default '';

alter table public.preventivi drop constraint if exists preventivi_modalita_spedizione_prezzo_check;
alter table public.preventivi
  add constraint preventivi_modalita_spedizione_prezzo_check check (
    modalita_spedizione_prezzo in ('non_applicabile', 'inserito', 'richiesto')
  );

comment on column public.preventivi.modalita_spedizione_prezzo is
  'inserito: prezzo già in riga. richiesto: in attesa del calcolo da Compiti e adempimenti.';

create table if not exists public.compiti_adempimenti (
  id uuid primary key default gen_random_uuid(),
  codice text not null,
  titolo text not null,
  spiegazione text not null default '',
  sort_order integer not null default 0,
  attivo boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  created_by uuid,
  updated_by uuid,
  deleted_at timestamptz,
  deleted_by uuid
);

create unique index if not exists compiti_adempimenti_codice_uidx
  on public.compiti_adempimenti (codice)
  where deleted_at is null;

create table if not exists public.compiti_adempimenti_persone (
  id uuid primary key default gen_random_uuid(),
  compito_id uuid not null references public.compiti_adempimenti (id),
  profile_id uuid not null references public.profiles (id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  created_by uuid,
  updated_by uuid,
  deleted_at timestamptz,
  deleted_by uuid
);

create unique index if not exists compiti_adempimenti_persone_uidx
  on public.compiti_adempimenti_persone (compito_id, profile_id)
  where deleted_at is null;

insert into public.compiti_adempimenti (codice, titolo, spiegazione, sort_order)
select
  'calcolo_spedizioni',
  'Calcolo spedizioni',
  'Calcola il costo di spedizione quando il preventivo è a carico dell''acquirente e il commerciale ha chiesto l''inserimento del prezzo. La mail è già compilata: inserisci solo l''importo e completa, così il preventivo viene inviato.',
  1
where not exists (
  select 1
  from public.compiti_adempimenti
  where codice = 'calcolo_spedizioni'
    and deleted_at is null
);

alter table public.compiti_adempimenti enable row level security;
alter table public.compiti_adempimenti_persone enable row level security;

drop policy if exists "compiti_adempimenti_select" on public.compiti_adempimenti;
create policy "compiti_adempimenti_select"
  on public.compiti_adempimenti for select to authenticated
  using (deleted_at is null);

drop policy if exists "compiti_adempimenti_write" on public.compiti_adempimenti;
create policy "compiti_adempimenti_write"
  on public.compiti_adempimenti for all to authenticated
  using (public.is_admin() or public.is_superadmin())
  with check (public.is_admin() or public.is_superadmin());

drop policy if exists "compiti_persone_select" on public.compiti_adempimenti_persone;
create policy "compiti_persone_select"
  on public.compiti_adempimenti_persone for select to authenticated
  using (deleted_at is null);

drop policy if exists "compiti_persone_write" on public.compiti_adempimenti_persone;
create policy "compiti_persone_write"
  on public.compiti_adempimenti_persone for all to authenticated
  using (public.is_admin() or public.is_superadmin())
  with check (public.is_admin() or public.is_superadmin());

grant select, insert, update on public.compiti_adempimenti to authenticated;
grant select, insert, update on public.compiti_adempimenti_persone to authenticated;
grant all on public.compiti_adempimenti to postgres, service_role;
grant all on public.compiti_adempimenti_persone to postgres, service_role;
