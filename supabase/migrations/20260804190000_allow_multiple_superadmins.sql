-- Consentiti più profili superadmin (es. Sandro + Angelo)
drop trigger if exists profiles_single_superadmin on public.profiles;
drop function if exists public.enforce_single_superadmin();
