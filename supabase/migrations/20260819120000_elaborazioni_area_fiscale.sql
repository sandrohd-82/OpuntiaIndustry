-- Area fiscale: lettura/scrittura elaborazioni contabili (sequenza commercialista)

drop policy if exists "elaborazioni_contabili_all" on public.elaborazioni_contabili;
create policy "elaborazioni_contabili_all"
  on public.elaborazioni_contabili for all to authenticated
  using (
    public.has_area_access('amministrazione')
    or public.has_area_access('area-fiscale')
    or public.is_superadmin()
  )
  with check (
    public.has_area_access('amministrazione')
    or public.has_area_access('area-fiscale')
    or public.is_superadmin()
  );

drop policy if exists "elaborazioni_contabili_voci_all"
  on public.elaborazioni_contabili_voci;
create policy "elaborazioni_contabili_voci_all"
  on public.elaborazioni_contabili_voci for all to authenticated
  using (
    public.has_area_access('amministrazione')
    or public.has_area_access('area-fiscale')
    or public.is_superadmin()
  )
  with check (
    public.has_area_access('amministrazione')
    or public.has_area_access('area-fiscale')
    or public.is_superadmin()
  );
