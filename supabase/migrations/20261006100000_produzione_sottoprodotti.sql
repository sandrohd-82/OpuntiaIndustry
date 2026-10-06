-- Secondo prodotto di lavorazione (non è uno scarto / non conformità).
-- Prenotato all'inserimento in produzione; quantità e codice alla chiusura del foglio.
-- ISO 9001: audit, soft delete, stato, versione, chi/quando.

create table if not exists public.produzione_sottoprodotti (
  id uuid primary key default gen_random_uuid(),
  campionatura_id uuid not null references public.campionature (id),
  campionatura_riga_id uuid not null references public.campionature_righe (id),
  numero_documento text not null,
  processo_id uuid references public.produzione_processi (id) on delete set null,
  processo_codice text not null default '',
  processo_nome text not null default '',
  lotto_interno_codice text not null,
  prodotto_ingresso_id uuid references public.prodotti_propri (id) on delete restrict,
  prodotto_ingresso_codice text not null,
  prodotto_uscita_id uuid references public.prodotti_propri (id) on delete restrict,
  prodotto_uscita_codice text not null,
  qty_uscita numeric(14, 3) not null check (qty_uscita > 0),
  unita text not null default 'kg',
  prodotto_sottoprodotto_id uuid references public.prodotti_propri (id) on delete restrict,
  prodotto_sottoprodotto_codice text not null default '',
  qty_consumata numeric(14, 3),
  qty_sottoprodotto numeric(14, 3),
  foglio_id uuid references public.produzione_fogli_lavorazione (id) on delete set null,
  stato text not null default 'prenotato'
    check (stato in ('prenotato', 'registrato')),
  versione integer not null default 1,
  documento_stato text not null default 'bozza'
    check (documento_stato in ('bozza', 'approvato', 'chiuso')),
  note text not null default '',
  registrato_at timestamptz,
  registrato_by uuid references auth.users (id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  created_by uuid references auth.users (id) on delete set null,
  updated_by uuid references auth.users (id) on delete set null,
  deleted_at timestamptz,
  deleted_by uuid references auth.users (id) on delete set null,
  constraint produzione_sottoprodotti_registrato_ok check (
    stato <> 'registrato'
    or (
      prodotto_sottoprodotto_id is not null
      and char_length(trim(prodotto_sottoprodotto_codice)) > 0
      and qty_consumata > 0
      and qty_sottoprodotto > 0
      and foglio_id is not null
      and registrato_at is not null
      and registrato_by is not null
    )
  )
);

create unique index if not exists produzione_sottoprodotti_riga_attiva_uidx
  on public.produzione_sottoprodotti (campionatura_riga_id)
  where deleted_at is null;

create index if not exists produzione_sottoprodotti_prenotati_idx
  on public.produzione_sottoprodotti (prodotto_uscita_codice)
  where deleted_at is null and stato = 'prenotato';

comment on table public.produzione_sottoprodotti is
  'Secondo prodotto nato da una lavorazione. Prenotato in inserimento, registrato alla chiusura del foglio. Non è uno scarto.';

drop trigger if exists produzione_sottoprodotti_updated_at
  on public.produzione_sottoprodotti;
create trigger produzione_sottoprodotti_updated_at
  before update on public.produzione_sottoprodotti
  for each row execute function public.set_updated_at();

alter table public.produzione_sottoprodotti enable row level security;

drop policy if exists produzione_sottoprodotti_all
  on public.produzione_sottoprodotti;
create policy produzione_sottoprodotti_all
  on public.produzione_sottoprodotti for all to authenticated
  using (
    public.has_area_access('produzione')
    or public.has_area_access('amministrazione')
    or public.is_superadmin()
  )
  with check (
    public.has_area_access('produzione')
    or public.has_area_access('amministrazione')
    or public.is_superadmin()
  );

grant select, insert, update on table public.produzione_sottoprodotti to authenticated;
grant all on table public.produzione_sottoprodotti to postgres, service_role;
revoke delete on table public.produzione_sottoprodotti from authenticated;
