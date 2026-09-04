-- Stato richiesto per ogni macchina coinvolta nell’evento di linea.

alter table public.produzione_eventi_linea_catalogo_macchine
  add column if not exists stato_obiettivo text not null default 'off';

do $$
begin
  if not exists (
    select 1 from pg_constraint
    where conrelid = 'public.produzione_eventi_linea_catalogo_macchine'::regclass
      and conname = 'produzione_eventi_linea_cat_mac_stato_check'
  ) then
    alter table public.produzione_eventi_linea_catalogo_macchine
      add constraint produzione_eventi_linea_cat_mac_stato_check
      check (stato_obiettivo in ('off', 'on'));
  end if;
end $$;

update public.produzione_eventi_linea_catalogo_macchine x
set stato_obiettivo = case
  when c.stato_obiettivo = 'on' then 'on'
  else 'off'
end
from public.produzione_eventi_linea_catalogo c
where c.id = x.catalogo_id
  and x.deleted_at is null;

comment on column public.produzione_eventi_linea_catalogo_macchine.stato_obiettivo is
  'Stato in cui la macchina coinvolta deve trovarsi per l’evento.';

alter table public.produzione_evento_linea_macchine
  add column if not exists stato_obiettivo text not null default 'off';

do $$
begin
  if not exists (
    select 1 from pg_constraint
    where conrelid = 'public.produzione_evento_linea_macchine'::regclass
      and conname = 'produzione_evento_linea_macchine_stato_check'
  ) then
    alter table public.produzione_evento_linea_macchine
      add constraint produzione_evento_linea_macchine_stato_check
      check (stato_obiettivo in ('off', 'on'));
  end if;
end $$;
