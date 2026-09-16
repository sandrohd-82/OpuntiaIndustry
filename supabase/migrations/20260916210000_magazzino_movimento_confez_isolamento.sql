-- Confezione e isolamento sul carico Agrinsicilia (ISO 9001).
-- Obbligatori per chiudere la scheda, rimandabili: non bloccano il salvataggio quantità.
-- Magazzino può leggere il catalogo imballaggi (stadi confezione/isolamento).

alter table public.magazzino_movimenti
  add column if not exists confezione_id uuid
    references public.imballaggi_voci (id) on delete set null;

alter table public.magazzino_movimenti
  add column if not exists isolamento_id uuid
    references public.imballaggi_voci (id) on delete set null;

alter table public.magazzino_movimenti
  add column if not exists confez_isolamento_rimandato boolean not null default false;

comment on column public.magazzino_movimenti.confezione_id is
  'Voce imballaggio stadio confezione (o C&I). Null se rimandato.';
comment on column public.magazzino_movimenti.isolamento_id is
  'Voce imballaggio stadio isolamento (o C&I). Null se rimandato.';
comment on column public.magazzino_movimenti.confez_isolamento_rimandato is
  'true = confezione/isolamento da completare in un secondo momento.';

create index if not exists magazzino_movimenti_lotto_idx
  on public.magazzino_movimenti (prodotto_id, lotto_codice)
  where deleted_at is null and lotto_codice is not null;

drop policy if exists "imballaggi_voci_select" on public.imballaggi_voci;
create policy "imballaggi_voci_select"
  on public.imballaggi_voci for select
  to authenticated
  using (
    public.is_superadmin()
    or public.has_area_access('amministrazione')
    or public.has_area_access('commerciale')
    or public.has_area_access('magazzino')
    or public.has_area_access('produzione')
  );

notify pgrst, 'reload schema';
