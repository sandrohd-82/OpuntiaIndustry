-- Tempo medio di esecuzione sul catalogo attività di processo.
-- Le attività già presenti ricevono 0 secondi (modifica manuale successiva).

alter table public.produzione_processo_attivita
  add column if not exists tempo_medio_valore integer not null default 0,
  add column if not exists tempo_medio_unita text not null default 'sec';

update public.produzione_processo_attivita
set
  tempo_medio_valore = 0,
  tempo_medio_unita = 'sec'
where tempo_medio_valore is null
   or tempo_medio_unita is null
   or tempo_medio_unita not in ('sec', 'min', 'ore');

alter table public.produzione_processo_attivita
  drop constraint if exists produzione_processo_attivita_tempo_medio_valore_ck;

alter table public.produzione_processo_attivita
  add constraint produzione_processo_attivita_tempo_medio_valore_ck
  check (tempo_medio_valore >= 0);

alter table public.produzione_processo_attivita
  drop constraint if exists produzione_processo_attivita_tempo_medio_unita_ck;

alter table public.produzione_processo_attivita
  add constraint produzione_processo_attivita_tempo_medio_unita_ck
  check (tempo_medio_unita in ('sec', 'min', 'ore'));
