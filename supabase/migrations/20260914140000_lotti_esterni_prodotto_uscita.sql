-- Lotti esterni: lotto prodotto in uscita (ISO 9001 §7.5 / 8.5.2).
-- Formato 10 caratteri SSAA + 6 hex. Soft delete, audit, no delete fisico.

create table if not exists public.lotti_esterni (
  id uuid primary key default gen_random_uuid(),
  codice text not null,
  tipo text not null default 'prodotto_uscita'
    check (tipo in ('prodotto_uscita', 'prodotto_uscita_composito')),
  settimana integer not null check (settimana between 1 and 53),
  anno integer not null check (anno between 2000 and 2100),
  seq_hex text not null,
  foglio_lavorazione_id uuid
    references public.produzione_fogli_lavorazione (id) on delete set null,
  prodotto_codice text,
  prodotto_nome text,
  is_composito boolean not null default false,
  versione integer not null default 1,
  documento_stato text not null default 'registrato'
    check (documento_stato in ('bozza', 'registrato', 'chiuso')),
  public_token text not null,
  public_enabled boolean not null default true,
  visibilita jsonb not null default '{}'::jsonb,
  note text not null default '',
  generated_at timestamptz not null default now(),
  generated_by uuid references auth.users (id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  created_by uuid references auth.users (id) on delete set null,
  updated_by uuid references auth.users (id) on delete set null,
  deleted_at timestamptz,
  deleted_by uuid references auth.users (id) on delete set null,
  constraint lotti_esterni_codice_len check (char_length(codice) = 10),
  constraint lotti_esterni_codice_format
    check (codice ~ '^(0[1-9]|[1-4][0-9]|5[0-3])[0-9]{2}[0-9A-F]{6}$'),
  constraint lotti_esterni_seq_hex check (seq_hex ~ '^[0-9A-F]{6}$')
);

create unique index if not exists lotti_esterni_codice_uidx
  on public.lotti_esterni (codice)
  where deleted_at is null;
create unique index if not exists lotti_esterni_token_uidx
  on public.lotti_esterni (public_token)
  where deleted_at is null;
create unique index if not exists lotti_esterni_foglio_semplice_uidx
  on public.lotti_esterni (foglio_lavorazione_id)
  where deleted_at is null
    and foglio_lavorazione_id is not null
    and is_composito = false;

comment on table public.lotti_esterni is
  'Lotti esterni (vendita/DDT/fatture). Il primo tipo è lotto prodotto in uscita SSAA+6hex.';
comment on column public.lotti_esterni.codice is
  'SS = settimana ISO, AA = anno, 6 hex sequenziali. Max 10 caratteri.';
comment on column public.lotti_esterni.visibilita is
  'Check per QR pubblico: quali tappe della storia mostrare.';

drop trigger if exists lotti_esterni_updated_at on public.lotti_esterni;
create trigger lotti_esterni_updated_at
  before update on public.lotti_esterni
  for each row execute function public.set_updated_at();

create table if not exists public.lotti_esterni_componenti (
  id uuid primary key default gen_random_uuid(),
  lotto_composito_id uuid not null
    references public.lotti_esterni (id) on delete restrict,
  lotto_componente_id uuid not null
    references public.lotti_esterni (id) on delete restrict,
  quantita numeric(14, 3),
  unita text not null default 'kg',
  sort_order integer not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  created_by uuid references auth.users (id) on delete set null,
  updated_by uuid references auth.users (id) on delete set null,
  deleted_at timestamptz,
  deleted_by uuid references auth.users (id) on delete set null,
  constraint lotti_esterni_comp_diversi
    check (lotto_composito_id <> lotto_componente_id)
);

create unique index if not exists lotti_esterni_comp_uidx
  on public.lotti_esterni_componenti (lotto_composito_id, lotto_componente_id)
  where deleted_at is null;

comment on table public.lotti_esterni_componenti is
  'Lotto inclusivo: se la vendita usa due o più lotti in uscita se ne genera uno nuovo che li contiene.';

drop trigger if exists lotti_esterni_componenti_updated_at
  on public.lotti_esterni_componenti;
create trigger lotti_esterni_componenti_updated_at
  before update on public.lotti_esterni_componenti
  for each row execute function public.set_updated_at();

alter table public.produzione_fogli_lavorazione
  add column if not exists lotto_esterno_id uuid
    references public.lotti_esterni (id) on delete set null;

comment on column public.produzione_fogli_lavorazione.lotto_esterno_id is
  'Lotto prodotto in uscita generato alla creazione del foglio.';

alter table public.magazzino_movimenti
  add column if not exists lotto_esterno_id uuid
    references public.lotti_esterni (id) on delete set null;

comment on column public.magazzino_movimenti.lotto_esterno_id is
  'Lotto esterno (vendita) collegato al carico, di solito ereditato dal foglio.';

create index if not exists produzione_fogli_lavorazione_lotto_esterno_idx
  on public.produzione_fogli_lavorazione (lotto_esterno_id)
  where lotto_esterno_id is not null;
create index if not exists magazzino_movimenti_lotto_esterno_idx
  on public.magazzino_movimenti (lotto_esterno_id)
  where lotto_esterno_id is not null;

alter table public.lotti_esterni enable row level security;
alter table public.lotti_esterni_componenti enable row level security;

drop policy if exists lotti_esterni_write on public.lotti_esterni;
create policy lotti_esterni_write
  on public.lotti_esterni for all to authenticated
  using (
    public.has_area_access('produzione')
    or public.has_area_access('magazzino')
    or public.has_area_access('amministrazione')
    or public.is_superadmin()
  )
  with check (
    public.has_area_access('produzione')
    or public.has_area_access('magazzino')
    or public.has_area_access('amministrazione')
    or public.is_superadmin()
  );

drop policy if exists lotti_esterni_comp_write on public.lotti_esterni_componenti;
create policy lotti_esterni_comp_write
  on public.lotti_esterni_componenti for all to authenticated
  using (
    public.has_area_access('produzione')
    or public.has_area_access('magazzino')
    or public.has_area_access('amministrazione')
    or public.is_superadmin()
  )
  with check (
    public.has_area_access('produzione')
    or public.has_area_access('magazzino')
    or public.has_area_access('amministrazione')
    or public.is_superadmin()
  );

grant select, insert, update on table public.lotti_esterni to authenticated;
grant select, insert, update on table public.lotti_esterni_componenti to authenticated;
grant all on table public.lotti_esterni to postgres, service_role;
grant all on table public.lotti_esterni_componenti to postgres, service_role;
revoke delete on table public.lotti_esterni from authenticated;
revoke delete on table public.lotti_esterni_componenti from authenticated;
