-- Scrittura compiti e adempimenti: solo Super Admin.
-- La lettura resta aperta agli autenticati, così il preventivo trova gli incaricati.

drop policy if exists "compiti_adempimenti_write" on public.compiti_adempimenti;
create policy "compiti_adempimenti_write"
  on public.compiti_adempimenti for all to authenticated
  using (public.is_superadmin())
  with check (public.is_superadmin());

drop policy if exists "compiti_persone_write" on public.compiti_adempimenti_persone;
create policy "compiti_persone_write"
  on public.compiti_adempimenti_persone for all to authenticated
  using (public.is_superadmin())
  with check (public.is_superadmin());
