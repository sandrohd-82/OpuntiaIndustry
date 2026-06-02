-- Permessi per ruoli API Supabase (anon, authenticated, service_role)
-- Risolve: permission denied for table user_second_factor

grant usage on schema public to postgres, anon, authenticated, service_role;

grant all on table public.app_roles to postgres, service_role;
grant all on table public.areas to postgres, service_role;
grant all on table public.role_area_permissions to postgres, service_role;
grant all on table public.profiles to postgres, service_role;
grant all on table public.user_second_factor to postgres, service_role;
grant all on table public.auth_sessions_2fa to postgres, service_role;

grant select on table public.app_roles to anon, authenticated;
grant select on table public.areas to anon, authenticated;
grant select on table public.role_area_permissions to anon, authenticated;
grant select, insert, update on table public.profiles to authenticated;
grant select, insert, update, delete on table public.user_second_factor to authenticated;
grant select, insert on table public.auth_sessions_2fa to authenticated;

grant usage, select on all sequences in schema public to postgres, service_role, authenticated;
