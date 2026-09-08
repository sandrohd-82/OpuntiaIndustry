-- Tempistica attività: tempo medio riferito a "Ogni" quantità/unità (es. 2 sec ogni 1 pz).
-- Attività già presenti: 1 pz (modifica manuale successiva).

alter table public.produzione_processo_attivita
  add column if not exists tempo_ogni_valore integer not null default 1,
  add column if not exists tempo_ogni_unita text not null default 'pz';

update public.produzione_processo_attivita
set
  tempo_ogni_valore = 1,
  tempo_ogni_unita = 'pz'
where tempo_ogni_valore is null
   or tempo_ogni_valore < 1
   or tempo_ogni_unita is null
   or tempo_ogni_unita not in ('pz', 'kg', 'g', 'lt', 'ml');

alter table public.produzione_processo_attivita
  drop constraint if exists produzione_processo_attivita_tempo_ogni_valore_ck;

alter table public.produzione_processo_attivita
  add constraint produzione_processo_attivita_tempo_ogni_valore_ck
  check (tempo_ogni_valore >= 1);

alter table public.produzione_processo_attivita
  drop constraint if exists produzione_processo_attivita_tempo_ogni_unita_ck;

alter table public.produzione_processo_attivita
  add constraint produzione_processo_attivita_tempo_ogni_unita_ck
  check (tempo_ogni_unita in ('pz', 'kg', 'g', 'lt', 'ml'));
