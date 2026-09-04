-- Vasca di lavaggio = insieme; le macchine interne stanno sotto di lei.

alter table public.produzione_macchinari
  add column if not exists parent_id uuid
    references public.produzione_macchinari (id);

alter table public.produzione_macchinari
  add column if not exists tipo text not null default 'macchina';

do $$
begin
  if not exists (
    select 1 from pg_constraint
    where conrelid = 'public.produzione_macchinari'::regclass
      and conname = 'produzione_macchinari_tipo_check'
  ) then
    alter table public.produzione_macchinari
      add constraint produzione_macchinari_tipo_check
      check (tipo in ('macchina', 'insieme'));
  end if;
end $$;

create index if not exists produzione_macchinari_parent_idx
  on public.produzione_macchinari (parent_id)
  where deleted_at is null;

comment on column public.produzione_macchinari.tipo is
  'macchina = impianto con On/Off; insieme = gruppo senza stato proprio.';

update public.produzione_macchinari
set tipo = 'insieme',
    updated_at = now()
where lower(codice) = 'vasca-lavaggio'
  and deleted_at is null;

update public.produzione_macchinari c
set parent_id = p.id,
    updated_at = now()
from public.produzione_macchinari p
where p.deleted_at is null
  and c.deleted_at is null
  and p.area_id = c.area_id
  and lower(p.codice) = 'vasca-lavaggio'
  and lower(c.codice) in (
    'pompa-in-disinfettante',
    'soffiante',
    'nastro-risalita',
    'spruzzini'
  );

-- Eventi di linea: si selezionano le macchine vere, non l’insieme.
update public.produzione_eventi_linea_catalogo_macchine x
set deleted_at = now()
where x.deleted_at is null
  and exists (
    select 1
    from public.produzione_macchinari m
    where m.id = x.macchinario_id
      and m.tipo = 'insieme'
      and m.deleted_at is null
  );

do $$
declare c name;
begin
  select conname into c
  from pg_constraint
  where conrelid = 'public.produzione_macchinario_attivita'::regclass
    and contype = 'c'
    and pg_get_constraintdef(oid) ilike '%origine%';
  if c is not null then
    execute format(
      'alter table public.produzione_macchinario_attivita drop constraint %I',
      c
    );
  end if;
end $$;

alter table public.produzione_macchinario_attivita
  add constraint produzione_macchinario_attivita_origine_check
  check (origine in ('panoramica', 'scheda', 'evento_linea', 'iot', 'insieme'));
