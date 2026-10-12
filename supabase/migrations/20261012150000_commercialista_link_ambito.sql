-- Il link ospite apre solo l'elaborazione da cui è stato preparato
-- (un registro oppure l'intero trimestre), non il riepilogo.
-- I link già emessi verso il riepilogo vengono spenti.

alter table public.commercialista_link_ospite
  add column if not exists ambito text,
  add column if not exists registro text,
  add column if not exists anno integer,
  add column if not exists trimestre integer;

update public.commercialista_link_ospite
set revoked_at = coalesce(revoked_at, now())
where ambito is null;

alter table public.commercialista_link_ospite
  drop constraint if exists commercialista_link_ospite_ambito_check;

alter table public.commercialista_link_ospite
  add constraint commercialista_link_ospite_ambito_check check (
    revoked_at is not null
    or (
      ambito in ('registro', 'trimestre')
      and anno between 2000 and 2100
      and trimestre between 1 and 4
      and (
        (ambito = 'trimestre' and registro is null)
        or (
          ambito = 'registro'
          and registro in (
            'emessa',
            'ricevuta',
            'ddt_emesso',
            'ddt_ricevuto',
            'nota_emessa',
            'nota_ricevuta'
          )
        )
      )
    )
  );

comment on column public.commercialista_link_ospite.ambito is
  'registro = una sola area di Elabora; trimestre = Elabora trimestre.';
