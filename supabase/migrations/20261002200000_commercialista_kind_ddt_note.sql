-- Il registro commercialista distingue anche DDT e note di credito (ISO 9001 7.5).
-- La sequenza numerica di ogni registro resta sul proprio trimestre.

do $$
declare
  nome text;
begin
  for nome in
    select con.conname
    from pg_constraint con
    join pg_class rel on rel.oid = con.conrelid
    join pg_namespace nsp on nsp.oid = rel.relnamespace
    where nsp.nspname = 'public'
      and rel.relname = 'elaborazioni_contabili'
      and con.contype = 'c'
      and pg_get_constraintdef(con.oid) ilike '%emessa%'
  loop
    execute format(
      'alter table public.elaborazioni_contabili drop constraint %I',
      nome
    );
  end loop;
end $$;

alter table public.elaborazioni_contabili
  add constraint elaborazioni_contabili_kind_check
  check (
    kind in (
      'emessa',
      'ricevuta',
      'ddt_emesso',
      'ddt_ricevuto',
      'nota_emessa',
      'nota_ricevuta'
    )
  );
