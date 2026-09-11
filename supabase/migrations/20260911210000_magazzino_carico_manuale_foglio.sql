-- ISO 9001 §8.5.2: carico manuale Agrinsicilia con lotto e foglio (o bypass motivato).

alter table public.magazzino_giacenze
  drop constraint if exists magazzino_giacenze_catalog_kind_check;
alter table public.magazzino_giacenze
  add constraint magazzino_giacenze_catalog_kind_check
  check (
    catalog_kind in (
      'materia_prima',
      'prodotto_fornitore',
      'legacy_propri',
      'prodotto_proprio'
    )
  );

alter table public.magazzino_movimenti
  drop constraint if exists magazzino_movimenti_catalog_kind_check;
alter table public.magazzino_movimenti
  add constraint magazzino_movimenti_catalog_kind_check
  check (
    catalog_kind in (
      'materia_prima',
      'prodotto_fornitore',
      'legacy_propri',
      'prodotto_proprio'
    )
  );

alter table public.magazzino_movimenti
  add column if not exists lotto_codice text not null default '',
  add column if not exists foglio_id uuid references public.produzione_fogli_lavorazione (id) on delete set null,
  add column if not exists motivo_senza_foglio text;

alter table public.magazzino_movimenti
  drop constraint if exists magazzino_movimenti_foglio_bypass_check;
alter table public.magazzino_movimenti
  add constraint magazzino_movimenti_foglio_bypass_check
  check (
    motivo_senza_foglio is null
    or motivo_senza_foglio in ('inventario', 'rivisita_ordine')
  );

alter table public.magazzino_movimenti
  drop constraint if exists magazzino_movimenti_foglio_xor_check;
alter table public.magazzino_movimenti
  add constraint magazzino_movimenti_foglio_xor_check
  check (
    catalog_kind <> 'prodotto_proprio'
    or foglio_id is not null
    or motivo_senza_foglio is not null
  );

comment on column public.magazzino_movimenti.lotto_codice is
  'Lotto di carico/prelievo (testo; tracciabilità ISO).';
comment on column public.magazzino_movimenti.foglio_id is
  'Foglio di lavorazione collegato. Null solo con motivo bypass.';
comment on column public.magazzino_movimenti.motivo_senza_foglio is
  'inventario | rivisita_ordine se il foglio è bypassato.';

drop policy if exists "prodotti_propri_select_amministrazione" on public.prodotti_propri;
create policy "prodotti_propri_select_amministrazione"
  on public.prodotti_propri for select
  to authenticated
  using (
    public.is_superadmin()
    or public.has_area_access('amministrazione')
    or public.has_area_access('commerciale')
    or public.has_area_access('produzione')
    or public.has_area_access('magazzino')
  );

drop policy if exists produzione_fogli_lavorazione_all
  on public.produzione_fogli_lavorazione;
create policy produzione_fogli_lavorazione_all
  on public.produzione_fogli_lavorazione for all to authenticated
  using (
    public.has_area_access('produzione')
    or public.has_area_access('amministrazione')
    or public.has_area_access('magazzino')
    or public.is_superadmin()
  )
  with check (
    public.has_area_access('produzione')
    or public.has_area_access('amministrazione')
    or public.is_superadmin()
  );
