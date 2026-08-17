-- Profilo fiscale: regime IVA ordinario (commercializzazione al 22%)
-- Audit ISO 9001 sulla modifica

alter table public.company_fiscal_profile
  alter column regime_iva set default 'ordinario';

update public.company_fiscal_profile
set
  regime_iva = 'ordinario',
  tipi_colture = '[
    {"codice":"commercializzazione","label":"Commercializzazione prodotti","percentuale_compensazione":0,"aliquota_iva":22},
    {"codice":"fresco","label":"Prodotti freschi","percentuale_compensazione":0,"aliquota_iva":22},
    {"codice":"trasformato","label":"Prodotti trasformati","percentuale_compensazione":0,"aliquota_iva":22}
  ]'::jsonb,
  note = trim(
    both from
    coalesce(nullif(trim(note), ''), '')
    || case
      when coalesce(nullif(trim(note), ''), '') = '' then ''
      else E'\n'
    end
    || 'Regime IVA ordinario 22%: attività prevalente di commercializzazione (aggiornamento '
    || to_char(now() at time zone 'Europe/Rome', 'YYYY-MM-DD')
    || ').'
  ),
  versione = versione + 1,
  updated_at = now()
where company_key = 'default'
  and deleted_at is null
  and regime_iva is distinct from 'ordinario';

-- Audit immutabile (solo se esiste il profilo)
insert into public.company_fiscal_profile_audit (
  profile_id,
  changed_by,
  reason_for_change,
  previous_payload,
  next_payload
)
select
  p.id,
  null,
  'Passaggio a regime IVA ordinario 22% (commercializzazione)',
  jsonb_build_object(
    'regime_iva', 'speciale_agricolo_art34',
    'motivo', 'valore precedente tipico / pre-migrazione'
  ),
  jsonb_build_object(
    'regime_iva', p.regime_iva,
    'tipi_colture', p.tipi_colture,
    'versione', p.versione,
    'note', p.note
  )
from public.company_fiscal_profile p
where p.company_key = 'default'
  and p.deleted_at is null
  and p.regime_iva = 'ordinario'
  and not exists (
    select 1
    from public.company_fiscal_profile_audit a
    where a.profile_id = p.id
      and a.reason_for_change =
        'Passaggio a regime IVA ordinario 22% (commercializzazione)'
  );
