-- Trattativa commerciale sui possibili clienti.
-- Indipendente da stato ciclo vita (da_valutare / convertito / scartato).
-- ISO 9001 §8.5.2: chi/quando via updated_by + audit applicativo.

alter table public.clienti_possibili
  add column if not exists trattativa text not null default 'da_creare';

do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conname = 'clienti_possibili_trattativa_check'
      and conrelid = 'public.clienti_possibili'::regclass
  ) then
    alter table public.clienti_possibili
      add constraint clienti_possibili_trattativa_check
      check (trattativa in ('da_creare', 'attiva', 'congelata', 'bloccata'));
  end if;
end $$;

comment on column public.clienti_possibili.trattativa is
  'Stato trattativa: da_creare (grigio), attiva (verde), congelata (azzurro), bloccata (rosso).';

create index if not exists clienti_possibili_trattativa_idx
  on public.clienti_possibili (trattativa, updated_at desc)
  where deleted_at is null;
