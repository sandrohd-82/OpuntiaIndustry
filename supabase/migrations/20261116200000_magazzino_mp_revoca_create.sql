-- Revoca CREATE sullo schema public ai ruoli senza login del registro
-- materie prime. Resta USAGE. Le due funzioni restano di loro proprietà e
-- continuano a essere eseguite: CREATE serve per sostituirle, non per chiamarle.
-- Non si toccano tabelle, politiche, HACCP, approvvigionamenti o lotti.

do $$
declare
  v_owner text;
begin
  if exists (
    select 1
    from pg_roles
    where rolname in ('magazzino_mp_movimento', 'magazzino_mp_pulizia')
      and rolcanlogin
  ) then
    raise exception 'I ruoli del registro non devono avere login.';
  end if;

  select r.rolname into v_owner
  from pg_proc p
  join pg_roles r on r.oid = p.proowner
  where p.proname = 'magazzino_mp_registra_movimento'
    and p.pronamespace = 'public'::regnamespace
    and pg_get_function_identity_arguments(p.oid) =
      'p_prodotto_id uuid, p_tipo text, p_quantita numeric, p_unita text, p_chiave text, p_note text, p_barcode text';
  if v_owner is distinct from 'magazzino_mp_movimento' then
    raise exception 'Proprietario del registro inatteso: %', coalesce(v_owner, 'assente');
  end if;

  select r.rolname into v_owner
  from pg_proc p
  join pg_roles r on r.oid = p.proowner
  where p.proname = 'magazzino_mp_pulisci_test'
    and p.pronamespace = 'public'::regnamespace
    and pg_get_function_identity_arguments(p.oid) = 'p_chiave text';
  if v_owner is distinct from 'magazzino_mp_pulizia' then
    raise exception 'Proprietario della pulizia inatteso: %', coalesce(v_owner, 'assente');
  end if;
end $$;

revoke create on schema public from magazzino_mp_movimento;
revoke create on schema public from magazzino_mp_pulizia;

comment on role magazzino_mp_movimento is
  'Proprietario della sola registrazione movimenti materie prime. Nessun login. CREATE su public è revocato: per sostituire la funzione va concesso solo durante quella migrazione e poi revocato.';
comment on role magazzino_mp_pulizia is
  'Proprietario della sola pulizia test materie prime. Nessun login e nessun permesso sulla quantità. CREATE su public è revocato: per sostituire la funzione va concesso solo durante quella migrazione e poi revocato.';

-- Sostituire in seguito magazzino_mp_registra_movimento o magazzino_mp_pulisci_test
-- richiede, soltanto attorno al CREATE OR REPLACE e da un ruolo già membro:
--   grant create on schema public to <ruolo proprietario>;
--   set local role <ruolo proprietario>;
--   create or replace function ...
--   reset role;
--   revoke create on schema public from <ruolo proprietario>;
-- Rieseguire 20261116193000 dopo questa migrazione concede di nuovo CREATE
-- e va chiusa ripetendo la revoca.
