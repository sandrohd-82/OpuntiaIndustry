-- Fattura A4: intestazione/righe possono discostarsi dall’ordine (documento proprio).
-- Solo ADD IF NOT EXISTS, niente DROP.

set local lock_timeout = '8s';
set local statement_timeout = '30s';

alter table public.fatture_emesse
  add column if not exists destinatario_snapshot jsonb not null default '{}'::jsonb;

comment on column public.fatture_emesse.destinatario_snapshot is
  'ISO 7.5: intestazione fattura (ragione, P.IVA, CF, sede) anche se diversa dall’ordine/anagrafica.';

alter table public.fatture_emesse_righe
  add column if not exists unita_misura text not null default 'nr';

alter table public.fatture_emesse_righe
  add column if not exists deleted_at timestamptz;

alter table public.fatture_emesse_righe
  add column if not exists deleted_by uuid;
