-- Ambito elenco: oltre a tutte / proprie si può spegnere l'elenco.
-- ISO 9001: il vincolo resta sul valore ammesso. Nessuna delete fisica.

alter table public.profile_data_scopes
  drop constraint if exists profile_data_scopes_mode_check;

alter table public.profile_data_scopes
  add constraint profile_data_scopes_mode_check
  check (mode in ('tutte', 'proprie', 'da_oggi', 'aziende_proprie', 'spento'));

comment on table public.profile_data_scopes is
  'ISO: ambito dati (tutte / proprie / da oggi / aziende caricate / spento). Soft delete. Scrittura solo service_role.';
