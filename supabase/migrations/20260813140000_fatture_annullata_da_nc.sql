-- Fatture stornate da NC: stato "annullata" + riferimento NC (esclusione contabilizzazione)

alter table public.fatture_emesse
  drop constraint if exists fatture_emesse_stato_pagamento_check;

alter table public.fatture_emesse
  add constraint fatture_emesse_stato_pagamento_check
  check (stato_pagamento in ('pagato', 'da_pagare', 'annullata'));

alter table public.fatture_emesse
  add column if not exists annullata_da_nc_id uuid
    references public.fatture_emesse (id) on delete set null,
  add column if not exists annullata_at timestamptz,
  add column if not exists annullata_by uuid
    references auth.users (id) on delete set null;

comment on column public.fatture_emesse.stato_pagamento is
  'pagato | da_pagare | annullata (stornata da nota di credito — non contabilizzata)';
comment on column public.fatture_emesse.annullata_da_nc_id is
  'Nota di credito che ha annullato questa fattura (numero interno = targa NC in UI)';

create index if not exists fatture_emesse_annullata_da_nc_idx
  on public.fatture_emesse (annullata_da_nc_id)
  where annullata_da_nc_id is not null and deleted_at is null;

create index if not exists fatture_emesse_stato_pagamento_idx
  on public.fatture_emesse (stato_pagamento)
  where deleted_at is null;

-- Backfill: fatture collegate a NC attive → annullata
with nc_link as (
  select distinct on (nc.fattura_collegata_id)
    nc.fattura_collegata_id as fattura_id,
    nc.id as nc_id,
    nc.created_at as nc_created_at,
    nc.created_by as nc_created_by
  from public.fatture_emesse nc
  where nc.tipo_documento = 'nota_credito'
    and nc.deleted_at is null
    and nc.fattura_collegata_id is not null
  order by nc.fattura_collegata_id, nc.created_at desc
)
update public.fatture_emesse f
set
  stato_pagamento = 'annullata',
  annullata_da_nc_id = l.nc_id,
  annullata_at = coalesce(f.annullata_at, l.nc_created_at, now()),
  annullata_by = coalesce(f.annullata_by, l.nc_created_by),
  updated_at = now()
from nc_link l
where f.id = l.fattura_id
  and f.deleted_at is null
  and (f.tipo_documento = 'fattura' or f.tipo_documento is null);

-- Dilazioni residue della fattura annullata → annullata
update public.fatture_emesse_dilazioni d
set
  stato_pagamento = 'annullata',
  annullata_at = coalesce(d.annullata_at, now()),
  updated_at = now()
from public.fatture_emesse f
where d.fattura_id = f.id
  and f.stato_pagamento = 'annullata'
  and d.deleted_at is null
  and d.stato_pagamento <> 'annullata';
