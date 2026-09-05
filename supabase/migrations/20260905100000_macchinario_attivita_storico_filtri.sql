-- Storico attività macchinario: più tipi di evento + foglio di lavorazione.
-- Registro resta insert-only (ISO 9001 8.5.2).

alter table public.produzione_macchinario_attivita
  add column if not exists foglio_id uuid
    references public.produzione_fogli_lavorazione (id) on delete set null;

alter table public.produzione_macchinario_attivita
  drop constraint if exists produzione_macchinario_attivita_azione_check;

alter table public.produzione_macchinario_attivita
  add constraint produzione_macchinario_attivita_azione_check
  check (
    azione in (
      'on',
      'off',
      'arresto',
      'comando_iot',
      'ack_iot',
      'config_iot'
    )
  );

create index if not exists produzione_macchinario_attivita_foglio_idx
  on public.produzione_macchinario_attivita (foglio_id, created_at desc)
  where foglio_id is not null;

create index if not exists produzione_macchinario_attivita_azione_idx
  on public.produzione_macchinario_attivita (macchinario_id, azione, created_at desc);

comment on column public.produzione_macchinario_attivita.foglio_id is
  'Foglio di lavorazione aperto (o abbinato per data) al momento dell’attività.';

comment on table public.produzione_macchinario_attivita is
  'Registro immutabile attività macchina: On/Off, arresto, IoT, foglio. Solo insert.';

-- Abbinamento retroattivo: foglio il cui intervallo contiene created_at (il più recente).
update public.produzione_macchinario_attivita a
set foglio_id = x.foglio_id
from (
  select distinct on (a2.id)
    a2.id as attivita_id,
    fl.id as foglio_id
  from public.produzione_macchinario_attivita a2
  inner join public.produzione_fogli_lavorazione fl
    on fl.deleted_at is null
   and a2.created_at >= fl.started_at
   and a2.created_at < coalesce(fl.closed_at, now() + interval '1 second')
  where a2.foglio_id is null
  order by a2.id, fl.started_at desc
) x
where a.id = x.attivita_id
  and a.foglio_id is null;
