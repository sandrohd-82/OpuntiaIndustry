-- Il service role legge e scrive il caveau. Il browser resta senza permessi.

grant select, insert, update, delete on table public.caveau_siti_aziendali to service_role;
grant select, insert, update, delete on table public.caveau_siti_acquisti to service_role;

notify pgrst, 'reload schema';
