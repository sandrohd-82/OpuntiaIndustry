-- Attività: modalità tempo throughput | durata fissa + quantità ciclo (ISO 9001)

alter table public.attivita
  add column if not exists modalita_tempo text not null default 'throughput';

alter table public.attivita
  drop constraint if exists attivita_modalita_tempo_check;

alter table public.attivita
  add constraint attivita_modalita_tempo_check
  check (modalita_tempo in ('throughput', 'durata_fissa'));

alter table public.attivita
  add column if not exists ore_ciclo numeric(8, 2);

alter table public.attivita
  add column if not exists quantita_modo text;

alter table public.attivita
  drop constraint if exists attivita_quantita_modo_check;

alter table public.attivita
  add constraint attivita_quantita_modo_check
  check (
    quantita_modo is null
    or quantita_modo in ('fissa', 'range', 'variabile', 'nessuna')
  );

alter table public.attivita
  add column if not exists quantita_valore numeric(12, 3);

alter table public.attivita
  add column if not exists quantita_da numeric(12, 3);

alter table public.attivita
  add column if not exists quantita_a numeric(12, 3);

alter table public.attivita
  add column if not exists quantita_unita text not null default 'kg';

comment on column public.attivita.modalita_tempo is
  'throughput = kg/ora×ore/giorno; durata_fissa = ore_ciclo fisse (A1: ceil(ore/8))';
comment on column public.attivita.ore_ciclo is
  'Ore necessarie per un ciclo a durata fissa';
comment on column public.attivita.quantita_modo is
  'fissa | range | variabile | nessuna (es. pulizie)';

-- Backfill: esistenti restano throughput
update public.attivita
set modalita_tempo = 'throughput'
where coalesce(trim(modalita_tempo), '') = '';
