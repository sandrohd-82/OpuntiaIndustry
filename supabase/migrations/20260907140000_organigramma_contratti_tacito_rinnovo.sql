-- Tacito rinnovo + ciclo di vita contratto (ISO 9001 8.5.2 / 7.5).
-- Stati: proposto → accettato | respinto. Validità In essere / Scaduto derivata dalle date.

alter table public.organigramma_contratti
  add column if not exists tacito_rinnovo boolean not null default false;

alter table public.organigramma_contratti
  add column if not exists rinnovato_da_id uuid
    references public.organigramma_contratti (id);

do $$
declare
  c name;
begin
  select con.conname into c
  from pg_constraint con
  where con.conrelid = 'public.organigramma_contratti'::regclass
    and con.contype = 'c'
    and pg_get_constraintdef(con.oid) ilike '%documento_stato%';
  if c is not null then
    execute format('alter table public.organigramma_contratti drop constraint %I', c);
  end if;
end $$;

update public.organigramma_contratti
set documento_stato = case documento_stato
  when 'bozza' then 'proposto'
  when 'approvato' then 'accettato'
  when 'chiuso' then 'accettato'
  else documento_stato
end
where documento_stato in ('bozza', 'approvato', 'chiuso');

alter table public.organigramma_contratti
  drop constraint if exists organigramma_contratti_documento_stato_check;

alter table public.organigramma_contratti
  add constraint organigramma_contratti_documento_stato_check
  check (documento_stato in ('proposto', 'accettato', 'respinto'));

alter table public.organigramma_contratti
  alter column documento_stato set default 'proposto';

create index if not exists organigramma_contratti_rinnovo_idx
  on public.organigramma_contratti (rinnovato_da_id)
  where deleted_at is null;

comment on column public.organigramma_contratti.tacito_rinnovo is
  'Contratto soggetto a tacito rinnovo (copie generate su azione esplicita).';
comment on column public.organigramma_contratti.rinnovato_da_id is
  'Contratto precedente nella catena di tacito rinnovo.';
