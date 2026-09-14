-- ISO 9001 §7.5: le nuove pagine Strumenti devono comparire a chi già
-- vede Produzione o i Fogli di lavorazione (nessun delete fisico).

insert into public.profile_page_access (
  profile_id,
  page_key,
  visibile,
  created_by,
  updated_by
)
select distinct
  p.profile_id,
  k.page_key,
  true,
  p.profile_id,
  p.profile_id
from public.profile_page_access p
cross join (
  values
    ('/app/produzione/strumenti'),
    ('/app/produzione/strumenti/generatore-lotti'),
    ('/app/produzione/strumenti/decifratore'),
    ('/app/produzione/strumenti/generatore-barcode'),
    ('/app/produzione/strumenti/barcode-mp'),
    ('/app/produzione/strumenti/barcode-prodotti')
) as k(page_key)
where p.deleted_at is null
  and p.visibile is true
  and (
    p.page_key = '/app/produzione'
    or p.page_key like '/app/produzione/fogli-lavorazione%'
  )
  and not exists (
    select 1
    from public.profile_page_access x
    where x.profile_id = p.profile_id
      and x.page_key = k.page_key
      and x.deleted_at is null
  );
