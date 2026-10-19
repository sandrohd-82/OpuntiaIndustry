-- La nazione CZ era registrata come «Cechia» e non compariva cercando «Repubblica Ceca».

insert into public.geo_nazioni (iso2, continente_codice, nome, lingue_iso)
select 'CZ', 'europa', 'Repubblica Ceca', '{cs}'::text[]
where not exists (
  select 1
  from public.geo_nazioni
  where upper(iso2) = 'CZ'
    and deleted_at is null
);

update public.geo_nazioni
set nome = 'Repubblica Ceca'
where upper(iso2) = 'CZ'
  and deleted_at is null
  and nome is distinct from 'Repubblica Ceca';

update public.clienti
set sede_amm_nazione = 'Repubblica Ceca'
where lower(trim(sede_amm_nazione)) = 'cechia';

update public.clienti
set sede_mag_nazione = 'Repubblica Ceca'
where lower(trim(sede_mag_nazione)) = 'cechia';

update public.clienti_possibili
set sede_amm_nazione = 'Repubblica Ceca'
where lower(trim(sede_amm_nazione)) = 'cechia';

update public.clienti_possibili
set sede_mag_nazione = 'Repubblica Ceca'
where lower(trim(sede_mag_nazione)) = 'cechia';

update public.fornitori
set sede_amm_nazione = 'Repubblica Ceca'
where lower(trim(sede_amm_nazione)) = 'cechia';

update public.fornitori
set sede_mag_nazione = 'Repubblica Ceca'
where lower(trim(sede_mag_nazione)) = 'cechia';

update public.anagrafica_sedi
set nazione = 'Repubblica Ceca'
where lower(trim(nazione)) = 'cechia';
