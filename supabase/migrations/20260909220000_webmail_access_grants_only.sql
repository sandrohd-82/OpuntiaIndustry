-- Accesso casella webmail: solo grant On (o Super Admin reale via is_superadmin).
-- Amministrazione e owner non sbloccano più tutte le caselle.

create or replace function public.can_access_webmail_account(p_account_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select
    public.is_superadmin()
    or exists (
      select 1
      from public.webmail_account_grants g
      where g.account_id = p_account_id
        and g.user_id = auth.uid()
        and g.deleted_at is null
    );
$$;

comment on function public.can_access_webmail_account(uuid) is
  'Accesso casella: Super Admin, oppure grant attivo dell''operatore (On). Off = nascosta.';
