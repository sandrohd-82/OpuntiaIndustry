-- Fix: Scarta usa upsert → serve UPDATE + grant espliciti su fic_import_discarded

grant usage on schema public to authenticated;

grant select, insert, update on table public.fic_import_discarded to authenticated;
grant all on table public.fic_import_discarded to postgres, service_role;

alter table public.fic_import_discarded enable row level security;

drop policy if exists "fic_import_discarded_select_amm" on public.fic_import_discarded;
create policy "fic_import_discarded_select_amm"
  on public.fic_import_discarded for select
  to authenticated
  using (public.has_area_access('amministrazione') or public.is_superadmin());

drop policy if exists "fic_import_discarded_insert_amm" on public.fic_import_discarded;
create policy "fic_import_discarded_insert_amm"
  on public.fic_import_discarded for insert
  to authenticated
  with check (public.has_area_access('amministrazione') or public.is_superadmin());

drop policy if exists "fic_import_discarded_update_amm" on public.fic_import_discarded;
create policy "fic_import_discarded_update_amm"
  on public.fic_import_discarded for update
  to authenticated
  using (public.has_area_access('amministrazione') or public.is_superadmin())
  with check (public.has_area_access('amministrazione') or public.is_superadmin());

-- Checkpoint: assicurati grant/policy (usati da Pausa / ripresa)
grant select, insert, update on table public.fic_import_checkpoints to authenticated;
grant all on table public.fic_import_checkpoints to postgres, service_role;

alter table public.fic_import_checkpoints enable row level security;

drop policy if exists "fic_import_checkpoints_select_amm" on public.fic_import_checkpoints;
create policy "fic_import_checkpoints_select_amm"
  on public.fic_import_checkpoints for select
  to authenticated
  using (public.has_area_access('amministrazione') or public.is_superadmin());

drop policy if exists "fic_import_checkpoints_insert_amm" on public.fic_import_checkpoints;
create policy "fic_import_checkpoints_insert_amm"
  on public.fic_import_checkpoints for insert
  to authenticated
  with check (public.has_area_access('amministrazione') or public.is_superadmin());

drop policy if exists "fic_import_checkpoints_update_amm" on public.fic_import_checkpoints;
create policy "fic_import_checkpoints_update_amm"
  on public.fic_import_checkpoints for update
  to authenticated
  using (public.has_area_access('amministrazione') or public.is_superadmin())
  with check (public.has_area_access('amministrazione') or public.is_superadmin());
