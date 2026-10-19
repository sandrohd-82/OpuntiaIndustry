-- Soft delete delle notifiche: la riga aggiornata deve restare leggibile
-- dal destinatario, altrimenti l'UPDATE fallisce con
-- "new row violates row-level security policy".
-- L'inbox continua a filtrare deleted_at is null.

drop policy if exists "app_notifiche_select_own" on public.app_notifiche;
create policy "app_notifiche_select_own"
  on public.app_notifiche for select to authenticated
  using (
    recipient_id = public.app_effective_uid()
    or recipient_id = auth.uid()
  );

comment on policy "app_notifiche_select_own" on public.app_notifiche is
  'Il destinatario legge le proprie notifiche, anche dopo il soft delete. Le liste applicative escludono deleted_at.';
