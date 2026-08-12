-- Note di credito: trasporto sottrai/incassi, stato incasso, rimborso, dilazioni annullate — ISO 9001

-- ---------------------------------------------------------------------------
-- fatture_emesse: campi NC
-- ---------------------------------------------------------------------------
alter table public.fatture_emesse
  add column if not exists spedizione_sottrai_incassi boolean not null default true,
  add column if not exists stato_incasso_nc text,
  add column if not exists rimborso_necessario boolean,
  add column if not exists rimborso_mezzo text,
  add column if not exists fattura_compensativa_id uuid references public.fatture_emesse (id) on delete set null;

alter table public.fatture_emesse drop constraint if exists fatture_emesse_stato_incasso_nc_check;
alter table public.fatture_emesse
  add constraint fatture_emesse_stato_incasso_nc_check
  check (
    stato_incasso_nc is null
    or stato_incasso_nc in ('gia_incassata', 'non_incassata')
  );

alter table public.fatture_emesse drop constraint if exists fatture_emesse_rimborso_mezzo_check;
alter table public.fatture_emesse
  add constraint fatture_emesse_rimborso_mezzo_check
  check (
    rimborso_mezzo is null
    or rimborso_mezzo in ('denaro', 'rimpiazzo_merce', 'nuova_fattura')
  );

comment on column public.fatture_emesse.spedizione_sottrai_incassi is
  'NC: se false il trasporto non riduce gli incassi (resta nel fatturato)';
comment on column public.fatture_emesse.stato_incasso_nc is
  'Solo nota_credito: gia_incassata | non_incassata';
comment on column public.fatture_emesse.rimborso_necessario is
  'NC già incassata: se serve rimborso al cliente';
comment on column public.fatture_emesse.rimborso_mezzo is
  'denaro | rimpiazzo_merce | nuova_fattura';
comment on column public.fatture_emesse.fattura_compensativa_id is
  'Fattura emessa che compensa la NC (rimborso via nuova fattura)';

create index if not exists fatture_emesse_compensativa_idx
  on public.fatture_emesse (fattura_compensativa_id)
  where deleted_at is null and fattura_compensativa_id is not null;

create index if not exists fatture_emesse_nc_rimborso_attesa_idx
  on public.fatture_emesse (cliente_id, data_emissione desc)
  where deleted_at is null
    and tipo_documento = 'nota_credito'
    and rimborso_mezzo = 'nuova_fattura'
    and fattura_compensativa_id is null;

-- ---------------------------------------------------------------------------
-- Dilazioni: stato annullata + chi/quando (soft, non delete fisico)
-- ---------------------------------------------------------------------------
alter table public.fatture_emesse_dilazioni
  add column if not exists annullata_at timestamptz,
  add column if not exists annullata_by uuid references auth.users (id) on delete set null;

alter table public.fatture_emesse_dilazioni
  drop constraint if exists fatture_emesse_dilazioni_stato_check;
alter table public.fatture_emesse_dilazioni
  add constraint fatture_emesse_dilazioni_stato_check check (
    stato_pagamento in ('pagato', 'da_pagare', 'annullata')
  );

comment on column public.fatture_emesse_dilazioni.annullata_at is
  'Quando la rata è stata annullata (es. da nota di credito)';
comment on column public.fatture_emesse_dilazioni.annullata_by is
  'Utente che ha annullato la dilazione';
