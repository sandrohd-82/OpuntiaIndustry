-- Catalogo Sedi: tipo, descrizione, coordinate Maps (ISO 9001 §7.5)

alter table public.impostazioni_sedi
  add column if not exists descrizione text not null default '',
  add column if not exists tipo_sede text not null default 'amministrativa',
  add column if not exists maps_url text not null default '',
  add column if not exists lat double precision,
  add column if not exists lng double precision;

do $$
begin
  if not exists (
    select 1 from pg_constraint
    where conname = 'impostazioni_sedi_tipo_check'
  ) then
    alter table public.impostazioni_sedi
      add constraint impostazioni_sedi_tipo_check
      check (
        tipo_sede in (
          'amministrativa',
          'produttiva',
          'magazzino',
          'terreno_agricolo',
          'legale'
        )
      );
  end if;
end $$;

comment on column public.impostazioni_sedi.tipo_sede is
  'Amministrativa, produttiva, magazzino, terreno agricolo, legale';
comment on column public.impostazioni_sedi.maps_url is
  'Link Google Maps della sede';
