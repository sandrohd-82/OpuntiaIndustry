-- Scaletta Produzione: impegni anche per campionature + snapshot processazione
-- ISO 9001 §8.5.2 tracciabilità, soft delete già presente su impegni/campionature.

alter table public.produzione_calendario_impegni
  add column if not exists campionatura_id uuid references public.campionature (id) on delete set null;

create index if not exists produzione_cal_impegni_campionatura_idx
  on public.produzione_calendario_impegni (campionatura_id, data_giorno)
  where deleted_at is null and campionatura_id is not null;

create unique index if not exists produzione_cal_impegni_giorno_camp_note_uidx
  on public.produzione_calendario_impegni (data_giorno, campionatura_id, note)
  where deleted_at is null and campionatura_id is not null;

comment on column public.produzione_calendario_impegni.campionatura_id is
  'Impegno scaletta per campionatura (ordine_id resta per ordini merce)';

alter table public.campionature
  add column if not exists data_lavorazione date,
  add column if not exists data_confezionamento date,
  add column if not exists produzione_snapshot jsonb not null default '{}'::jsonb;

comment on column public.campionature.data_lavorazione is
  'Giorno di lavorazione in scaletta produzione';
comment on column public.campionature.data_confezionamento is
  'Giorno di confezionamento in scaletta produzione';
comment on column public.campionature.produzione_snapshot is
  'Lotti, processi e imballaggi firmati al passaggio in scaletta';
