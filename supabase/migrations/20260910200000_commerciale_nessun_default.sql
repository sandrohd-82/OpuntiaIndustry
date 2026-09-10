-- ISO 9001: l’azienda non nasce collegata a un commerciale.
-- Il Super Admin collega in un secondo momento una scheda già presente.

comment on column public.clienti.commerciale_id is
  'Commerciale assegnato dal Super Admin (un solo profilo). Null = azienda, non collegata. Audit: commerciale_assegnato_at / commerciale_assegnato_by.';

comment on column public.clienti_possibili.commerciale_id is
  'Commerciale assegnato dal Super Admin al possibile cliente. Null = azienda, non collegata.';

update public.clienti
set
  commerciale_id = null,
  commerciale_assegnato_at = null,
  commerciale_assegnato_by = null,
  updated_at = now()
where deleted_at is null
  and commerciale_id is not null;

update public.clienti_possibili
set
  commerciale_id = null,
  commerciale_assegnato_at = null,
  commerciale_assegnato_by = null,
  updated_at = now()
where deleted_at is null
  and commerciale_id is not null;

insert into public.audit_log (
  entity_type,
  entity_id,
  action,
  summary,
  payload
)
values (
  'clienti',
  '00000000-0000-0000-0000-000000000000',
  'update',
  'Revoca collegamenti commerciali automatici: le aziende restano dell’azienda fino ad assegnazione Super Admin',
  jsonb_build_object('scope', 'clienti_e_possibili', 'motivo', 'nessun_default')
);
