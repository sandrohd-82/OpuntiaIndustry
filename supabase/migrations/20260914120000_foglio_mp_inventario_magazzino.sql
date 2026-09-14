-- Foglio Codice MP Lavorata da carico/settaggio magazzino (ISO 9001 §7.5 / 8.5.2).
-- Collegamento bidirezionale movimento ↔ foglio, senza delete fisico.

alter table public.produzione_fogli_ingresso_mp
  add column if not exists origine text not null default 'ingresso',
  add column if not exists movimento_magazzino_id uuid
    references public.magazzino_movimenti (id) on delete set null,
  add column if not exists prodotto_proprio_id uuid
    references public.prodotti_propri (id) on delete set null,
  add column if not exists lotto_lavorazione text;

alter table public.produzione_fogli_ingresso_mp
  drop constraint if exists fogli_ingresso_mp_origine_check;
alter table public.produzione_fogli_ingresso_mp
  add constraint fogli_ingresso_mp_origine_check
  check (origine in ('ingresso', 'inventario_magazzino'));

alter table public.produzione_fogli_ingresso_mp
  alter column fornitore_id drop not null;
alter table public.produzione_fogli_ingresso_mp
  alter column materia_prima_id drop not null;

alter table public.produzione_fogli_ingresso_mp
  drop constraint if exists fogli_ingresso_mp_origine_refs_check;
alter table public.produzione_fogli_ingresso_mp
  add constraint fogli_ingresso_mp_origine_refs_check
  check (
    (
      origine = 'ingresso'
      and fornitore_id is not null
      and materia_prima_id is not null
    )
    or origine = 'inventario_magazzino'
  );

comment on column public.produzione_fogli_ingresso_mp.origine is
  'ingresso = carico produttore; inventario_magazzino = codice MP creato per carico/settaggio merce.';
comment on column public.produzione_fogli_ingresso_mp.movimento_magazzino_id is
  'Movimento magazzino che ha materializzato il foglio inventario.';
comment on column public.produzione_fogli_ingresso_mp.lotto_lavorazione is
  'Lotto Agrinsicilia L-… collegato al codice MP inventario.';

alter table public.magazzino_movimenti
  add column if not exists foglio_ingresso_mp_id uuid
    references public.produzione_fogli_ingresso_mp (id) on delete set null;

comment on column public.magazzino_movimenti.foglio_ingresso_mp_id is
  'Foglio Codice MP Lavorata creato o collegato al carico.';

drop policy if exists "ingresso_mp_fogli_write" on public.produzione_fogli_ingresso_mp;
create policy "ingresso_mp_fogli_write"
  on public.produzione_fogli_ingresso_mp for all to authenticated
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
