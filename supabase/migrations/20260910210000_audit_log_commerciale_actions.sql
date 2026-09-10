-- ISO 9001: il registro audit deve accettare le azioni di collegamento commerciale.

alter table public.audit_log drop constraint if exists audit_log_action_check;
alter table public.audit_log
  add constraint audit_log_action_check check (
    action in (
      'create',
      'update',
      'soft_delete',
      'restore',
      'status_change',
      'attachment_upload',
      'attachment_remove',
      'purge_test_ordini',
      'rinumera_per_data_emissione',
      'create_nota_credito',
      'annulla_dilazioni_da_nc',
      'collega_fattura_compensativa',
      'commerciale_assegna',
      'commerciale_revoca',
      'commerciale_revoca_default'
    )
  );

insert into public.audit_log (
  entity_type,
  entity_id,
  action,
  summary,
  payload
)
select
  'clienti',
  '00000000-0000-0000-0000-000000000000',
  'commerciale_revoca_default',
  'Revoca collegamenti commerciali automatici: le aziende restano dell’azienda fino ad assegnazione Super Admin',
  jsonb_build_object('scope', 'clienti_e_possibili', 'motivo', 'nessun_default')
where not exists (
  select 1
  from public.audit_log
  where action in ('commerciale_revoca_default', 'update')
    and summary like 'Revoca collegamenti commerciali automatici%'
);
