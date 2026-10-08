-- Documentazione senza scadenza: la data resta vuota e non è obbligatoria.
-- Un documento senza data non passa da solo a Scaduto.

do $$
declare
  cname text;
begin
  select con.conname
    into cname
  from pg_constraint con
  where con.conrelid = 'public.documentazioni_aziendali'::regclass
    and con.contype = 'c'
    and pg_get_constraintdef(con.oid) ilike '%data_scadenza%'
  limit 1;
  if cname is not null then
    execute format(
      'alter table public.documentazioni_aziendali drop constraint %I',
      cname
    );
  end if;
end $$;

alter table public.documentazioni_aziendali
  alter column data_scadenza drop not null;

alter table public.documentazioni_aziendali
  drop constraint if exists documentazioni_aziendali_scadenza_check;

alter table public.documentazioni_aziendali
  add constraint documentazioni_aziendali_scadenza_check
  check (data_scadenza is null or data_scadenza >= data_inizio);

alter table public.documentazioni_versioni
  alter column data_scadenza drop not null;

comment on column public.documentazioni_aziendali.data_scadenza is
  'Null se il documento è dichiarato senza scadenza. In quel caso non diventa Scaduto da solo.';
