-- Esito operatore su riga scaletta (ISO 9001 §8.5.2 / §10.2)
-- Completata o problema con nota; soft-delete e audit già sulla tabella impegni.

alter table public.produzione_calendario_impegni
  add column if not exists esecuzione_stato text not null default 'aperta',
  add column if not exists problema_note text not null default '',
  add column if not exists esito_note text not null default '',
  add column if not exists eseguita_at timestamptz,
  add column if not exists eseguita_by uuid references auth.users (id) on delete set null,
  add column if not exists problema_at timestamptz,
  add column if not exists problema_by uuid references auth.users (id) on delete set null;

do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conname = 'produzione_cal_impegni_esecuzione_check'
  ) then
    alter table public.produzione_calendario_impegni
      add constraint produzione_cal_impegni_esecuzione_check
      check (esecuzione_stato in ('aperta', 'completata', 'problema'));
  end if;
end $$;

comment on column public.produzione_calendario_impegni.esecuzione_stato is
  'Esito operatore sulla lavorazione in scaletta';
comment on column public.produzione_calendario_impegni.problema_note is
  'Nota non conformità / problema riscontrato (ISO 10.2)';
