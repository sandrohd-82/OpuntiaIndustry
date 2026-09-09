-- WebMail collega-azienda usa createServiceClient() (role service_role)
-- per cercare referenti in rubrica. La tabella aveva GRANT solo a authenticated
-- → "permission denied for table rubrica_contatti".
-- Soft delete invariato; RLS resta su authenticated (amministrazione / superadmin).
-- Il service_role è usato solo dopo requireWebmailAccess() lato server.

grant select, insert, update on table public.rubrica_contatti
  to postgres, service_role;
grant select, insert, update on table public.rubrica_timeline
  to postgres, service_role;
grant select, insert, update, delete on table public.clienti_possibili_referenti
  to postgres, service_role;
grant select, insert, update, delete on table public.clienti_referenti
  to postgres, service_role;
grant select, insert, update, delete on table public.fornitori_referenti
  to postgres, service_role;

revoke delete on table public.rubrica_contatti from authenticated;
revoke delete on table public.rubrica_timeline from authenticated;
