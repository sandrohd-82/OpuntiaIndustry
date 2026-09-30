-- Accordo di prezzo per un prodotto su una sola azienda (cliente o possibile cliente).

create table if not exists public.accordi_prezzo_prodotto (
  id uuid primary key default gen_random_uuid(),
  azienda_tipo text not null
    check (azienda_tipo in ('cliente', 'cliente_possibile')),
  azienda_id uuid not null,
  prodotto_codice text not null,
  modalita text not null
    check (modalita in ('sconto_percentuale', 'prezzo_fisso')),
  sconto_pct numeric(6,2),
  prezzo_kg numeric(12,4),
  giustificazione text not null,
  versione integer not null default 1,
  stato text not null default 'concordato'
    check (stato in ('bozza', 'concordato', 'chiuso')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  created_by uuid references auth.users (id) on delete set null,
  updated_by uuid references auth.users (id) on delete set null,
  deleted_at timestamptz,
  deleted_by uuid references auth.users (id) on delete set null,
  constraint accordi_prezzo_prodotto_valore check (
    (
      modalita = 'sconto_percentuale'
      and sconto_pct is not null
      and sconto_pct >= 0
      and sconto_pct <= 100
      and prezzo_kg is null
    )
    or (
      modalita = 'prezzo_fisso'
      and prezzo_kg is not null
      and prezzo_kg > 0
      and sconto_pct is null
    )
  ),
  constraint accordi_prezzo_prodotto_motivo check (
    char_length(btrim(giustificazione)) >= 3
  )
);

create unique index if not exists accordi_prezzo_prodotto_open_uidx
  on public.accordi_prezzo_prodotto (azienda_tipo, azienda_id, prodotto_codice)
  where deleted_at is null;

create index if not exists accordi_prezzo_prodotto_azienda_idx
  on public.accordi_prezzo_prodotto (azienda_tipo, azienda_id)
  where deleted_at is null;

comment on table public.accordi_prezzo_prodotto is
  'Sconto fisso o prezzo al kg concordato per un prodotto con una sola azienda. Non dipende da quantità o confezione.';

drop trigger if exists accordi_prezzo_prodotto_updated_at on public.accordi_prezzo_prodotto;
create trigger accordi_prezzo_prodotto_updated_at
  before update on public.accordi_prezzo_prodotto
  for each row execute function public.set_updated_at();

alter table public.accordi_prezzo_prodotto enable row level security;

drop policy if exists "accordi_prezzo_prodotto_select" on public.accordi_prezzo_prodotto;
create policy "accordi_prezzo_prodotto_select"
  on public.accordi_prezzo_prodotto for select to authenticated
  using (
    deleted_at is null
    and (
      public.has_area_access('amministrazione')
      or public.has_area_access('commerciale')
      or public.is_superadmin()
    )
  );

drop policy if exists "accordi_prezzo_prodotto_insert" on public.accordi_prezzo_prodotto;
create policy "accordi_prezzo_prodotto_insert"
  on public.accordi_prezzo_prodotto for insert to authenticated
  with check (
    public.has_area_access('amministrazione')
    or public.has_area_access('commerciale')
    or public.is_superadmin()
  );

drop policy if exists "accordi_prezzo_prodotto_update" on public.accordi_prezzo_prodotto;
create policy "accordi_prezzo_prodotto_update"
  on public.accordi_prezzo_prodotto for update to authenticated
  using (
    deleted_at is null
    and (
      public.has_area_access('amministrazione')
      or public.has_area_access('commerciale')
      or public.is_superadmin()
    )
  )
  with check (
    public.has_area_access('amministrazione')
    or public.has_area_access('commerciale')
    or public.is_superadmin()
  );

grant select, insert, update on public.accordi_prezzo_prodotto to authenticated;
grant all on public.accordi_prezzo_prodotto to postgres, service_role;
revoke delete on public.accordi_prezzo_prodotto from authenticated;

alter table public.preventivi_righe
  add column if not exists accordo_id uuid,
  add column if not exists accordo_modalita text,
  add column if not exists accordo_valore_origine numeric(12,4),
  add column if not exists accordo_giustificazione text not null default '',
  add column if not exists accordo_forzato boolean not null default false;

alter table public.preventivi_righe
  drop constraint if exists preventivi_righe_accordo_modalita;
alter table public.preventivi_righe
  add constraint preventivi_righe_accordo_modalita
  check (
    accordo_modalita is null
    or accordo_modalita in ('sconto_percentuale', 'prezzo_fisso')
  );

comment on column public.preventivi_righe.accordo_giustificazione is
  'Motivo dello sconto o del prezzo al kg precompilato dalla scheda azienda. Resta sul documento anche se l''operatore modifica il valore.';

alter table public.ordini_righe
  add column if not exists accordo_id uuid,
  add column if not exists accordo_modalita text,
  add column if not exists accordo_valore_origine numeric(12,4),
  add column if not exists accordo_giustificazione text not null default '',
  add column if not exists accordo_forzato boolean not null default false;

alter table public.ordini_righe
  drop constraint if exists ordini_righe_accordo_modalita;
alter table public.ordini_righe
  add constraint ordini_righe_accordo_modalita
  check (
    accordo_modalita is null
    or accordo_modalita in ('sconto_percentuale', 'prezzo_fisso')
  );

comment on column public.ordini_righe.accordo_giustificazione is
  'Motivo dello sconto o del prezzo al kg precompilato dalla scheda azienda. Resta sull''ordine anche se l''operatore modifica il valore.';
