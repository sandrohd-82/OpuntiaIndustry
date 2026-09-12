-- Magazzino: lettura targhe fornitore per composizione lotto Agrinsicilia.

drop policy if exists "fornitori_select_magazzino" on public.fornitori;
create policy "fornitori_select_magazzino"
  on public.fornitori for select
  to authenticated
  using (
    public.has_area_access('magazzino')
    or public.has_area_access('amministrazione')
    or public.is_superadmin()
  );

comment on policy "fornitori_select_magazzino" on public.fornitori is
  'Magazzino legge targa/ragione sociale per il lotto lavorazione (senza F).';
