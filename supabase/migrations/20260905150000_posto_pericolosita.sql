-- Bandiera pericolosità postazione: alta (rosso), media (giallo), bassa (verde).
-- ISO 9001 6.1 (rischio) + 8.5.2 (tracciabilità del dato operativo).

alter table public.produzione_posti_lavoro
  add column if not exists pericolosita text not null default 'bassa';

do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conname = 'produzione_posti_lavoro_pericolosita_chk'
  ) then
    alter table public.produzione_posti_lavoro
      add constraint produzione_posti_lavoro_pericolosita_chk
      check (pericolosita in ('alta', 'media', 'bassa'));
  end if;
end $$;

update public.produzione_posti_lavoro
set pericolosita = 'bassa'
where pericolosita is null or pericolosita not in ('alta', 'media', 'bassa');

comment on column public.produzione_posti_lavoro.pericolosita is
  'Classificazione rischio postazione: alta (rosso, es. coltelli), media (giallo), bassa (verde).';
