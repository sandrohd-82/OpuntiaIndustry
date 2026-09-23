-- Luogo di partenza (catalogo Sedi) + chiusura confezionamento
-- Impostazioni > Sedi: catalogo; UI area al prossimo passo.
-- ISO 9001: audit, soft delete, nessuna cancellazione fisica.

create table if not exists public.impostazioni_sedi (
  id uuid primary key default gen_random_uuid(),
  codice text not null default '',
  nome text not null,
  indirizzo text not null default '',
  cap text not null default '',
  citta text not null default '',
  provincia text not null default '',
  nazione text not null default 'Italia',
  attiva boolean not null default true,
  sort_order integer not null default 0,
  documento_stato text not null default 'approvato',
  versione integer not null default 1,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  created_by uuid references auth.users (id) on delete set null,
  updated_by uuid references auth.users (id) on delete set null,
  deleted_at timestamptz,
  deleted_by uuid references auth.users (id) on delete set null,
  constraint impostazioni_sedi_nome_check check (char_length(trim(nome)) >= 2)
);

create index if not exists impostazioni_sedi_attiva_idx
  on public.impostazioni_sedi (sort_order, nome)
  where deleted_at is null and attiva = true;

drop trigger if exists impostazioni_sedi_updated_at on public.impostazioni_sedi;
create trigger impostazioni_sedi_updated_at
  before update on public.impostazioni_sedi
  for each row execute function public.set_updated_at();

alter table public.impostazioni_sedi enable row level security;

drop policy if exists "impostazioni_sedi_select" on public.impostazioni_sedi;
create policy "impostazioni_sedi_select"
  on public.impostazioni_sedi for select to authenticated
  using (
    public.is_superadmin()
    or public.has_area_access('impostazioni')
    or public.has_area_access('amministrazione')
    or public.has_area_access('produzione')
    or public.has_area_access('commerciale')
  );

drop policy if exists "impostazioni_sedi_write" on public.impostazioni_sedi;
create policy "impostazioni_sedi_write"
  on public.impostazioni_sedi for all to authenticated
  using (
    public.is_superadmin()
    or public.has_area_access('impostazioni')
    or public.has_area_access('amministrazione')
  )
  with check (
    public.is_superadmin()
    or public.has_area_access('impostazioni')
    or public.has_area_access('amministrazione')
  );

grant select, insert, update on table public.impostazioni_sedi to authenticated;
grant all on table public.impostazioni_sedi to postgres, service_role;
revoke delete on table public.impostazioni_sedi from authenticated;

comment on table public.impostazioni_sedi is
  'Sedi aziendali (partenza spedizione / ritiro). Catalogo Impostazioni > Sedi.';

alter table public.campionature
  add column if not exists sede_partenza_id uuid references public.impostazioni_sedi (id);

alter table public.ordini
  add column if not exists sede_partenza_id uuid references public.impostazioni_sedi (id);

comment on column public.campionature.sede_partenza_id is
  'Sede di partenza prevista (ritiro / spedizione)';
comment on column public.ordini.sede_partenza_id is
  'Sede di partenza prevista (ritiro / spedizione)';

alter table public.produzione_calendario_impegni
  drop constraint if exists produzione_cal_impegni_esecuzione_check;

alter table public.produzione_calendario_impegni
  add constraint produzione_cal_impegni_esecuzione_check
  check (esecuzione_stato in ('aperta', 'completata', 'problema', 'pronto_ritiro'));
