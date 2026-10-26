-- Scelta di quando la fattura dell'ordine parte allo SDI.
-- subito: all'atto della finalizzazione. al_processo: quando l'ordine entra in produzione.

alter table public.ordini
  add column if not exists invio_fattura_sdi text,
  add column if not exists invio_fattura_sdi_scelto_at timestamptz,
  add column if not exists invio_fattura_sdi_scelto_by uuid;

alter table public.ordini
  drop constraint if exists ordini_invio_fattura_sdi_check;

alter table public.ordini
  add constraint ordini_invio_fattura_sdi_check
  check (
    invio_fattura_sdi is null
    or invio_fattura_sdi in ('subito', 'al_processo')
  );
