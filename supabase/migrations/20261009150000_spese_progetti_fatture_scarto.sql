-- Lo scarto di una fattura ricevuta vale solo per quel progetto.
-- Il collegamento attivo resta unico: una ricevuta non entra in due pacchetti.

alter table public.spese_progetti_fatture
  add column if not exists esito text not null default 'collegata';

alter table public.spese_progetti_fatture
  drop constraint if exists spese_progetti_fatture_esito_chk;

alter table public.spese_progetti_fatture
  add constraint spese_progetti_fatture_esito_chk
  check (esito in ('collegata', 'scartata'));

comment on column public.spese_progetti_fatture.esito is
  'collegata: citata nel pacchetto. scartata: esclusa da questo progetto. Nessuno dei due stati modifica la fattura SDI.';

drop index if exists spese_progetti_fatture_emessa_attiva_uidx;
drop index if exists spese_progetti_fatture_ricevuta_attiva_uidx;

create unique index if not exists spese_progetti_fatture_emessa_collegata_uidx
  on public.spese_progetti_fatture (fattura_emessa_id)
  where deleted_at is null and esito = 'collegata' and fattura_emessa_id is not null;

create unique index if not exists spese_progetti_fatture_ricevuta_collegata_uidx
  on public.spese_progetti_fatture (fattura_ricevuta_id)
  where deleted_at is null and esito = 'collegata' and fattura_ricevuta_id is not null;

create unique index if not exists spese_progetti_fatture_scarto_uidx
  on public.spese_progetti_fatture (progetto_id, fattura_ricevuta_id)
  where deleted_at is null and esito = 'scartata' and fattura_ricevuta_id is not null;

notify pgrst, 'reload schema';
