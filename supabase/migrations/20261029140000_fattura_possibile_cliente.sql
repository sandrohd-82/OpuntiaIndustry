-- La bozza fattura può essere intestata a un possibile cliente.
-- Il passaggio a cliente avviene solo dopo l'invio SDI riuscito.

alter table public.fatture_emesse
  alter column cliente_id drop not null;

alter table public.fatture_emesse
  drop constraint if exists fatture_emesse_intestatario_check;

alter table public.fatture_emesse
  add constraint fatture_emesse_intestatario_check
  check (cliente_id is not null or cliente_possibile_id is not null);

comment on constraint fatture_emesse_intestatario_check on public.fatture_emesse is
  'Bozza intestata a un cliente oppure, prima della prima fattura SDI, a un possibile cliente.';
