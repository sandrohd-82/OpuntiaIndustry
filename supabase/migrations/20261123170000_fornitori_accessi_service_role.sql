-- Il collegamento dalla scheda usa la sessione del Super Admin.
-- Il service role resta abilitato per le operazioni di servizio sulla stessa tabella.

grant select, insert, update on table public.fornitori_accessi to service_role;
