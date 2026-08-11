-- Catalogo servizi/prodotti: targa Sz/Pr (corpo libero), note, is_bio
-- Prefisso case-insensitive in check; univocità su lower(codice)

-- ---------------------------------------------------------------------------
-- catalogo_servizi
-- ---------------------------------------------------------------------------
alter table public.catalogo_servizi
  add column if not exists note text not null default '',
  add column if not exists is_bio boolean not null default false;

alter table public.catalogo_servizi
  drop constraint if exists catalogo_servizi_codice_check;

alter table public.catalogo_servizi
  add constraint catalogo_servizi_codice_check
  check (codice ~* '^sz[A-Za-z0-9\-_\/]+$');

drop index if exists public.catalogo_servizi_codice_uidx;

create unique index if not exists catalogo_servizi_codice_lower_uidx
  on public.catalogo_servizi (lower(codice))
  where deleted_at is null;

comment on column public.catalogo_servizi.codice is
  'Targa servizio: prefisso Sz (qualsiasi case) + corpo libero (lettere, cifre, - _ /)';
comment on column public.catalogo_servizi.note is
  'Note operative ISO 9001';
comment on column public.catalogo_servizi.is_bio is
  'true = bio, false = convenzionale';

-- ---------------------------------------------------------------------------
-- catalogo_prodotti_fornitore
-- ---------------------------------------------------------------------------
alter table public.catalogo_prodotti_fornitore
  add column if not exists note text not null default '',
  add column if not exists is_bio boolean not null default false;

alter table public.catalogo_prodotti_fornitore
  drop constraint if exists catalogo_prodotti_fornitore_codice_check;

alter table public.catalogo_prodotti_fornitore
  add constraint catalogo_prodotti_fornitore_codice_check
  check (codice ~* '^pr[A-Za-z0-9\-_\/]+$');

drop index if exists public.catalogo_prodotti_fornitore_codice_uidx;

create unique index if not exists catalogo_prodotti_fornitore_codice_lower_uidx
  on public.catalogo_prodotti_fornitore (lower(codice))
  where deleted_at is null;

comment on column public.catalogo_prodotti_fornitore.codice is
  'Targa prodotto fornitore: prefisso Pr (qualsiasi case) + corpo libero (lettere, cifre, - _ /)';
comment on column public.catalogo_prodotti_fornitore.note is
  'Note operative ISO 9001';
comment on column public.catalogo_prodotti_fornitore.is_bio is
  'true = bio, false = convenzionale';
