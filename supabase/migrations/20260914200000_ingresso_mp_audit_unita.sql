-- Audit fogli contenitore ingresso MP (lotto + unità).
-- ISO 9001: 8.5.2 tracciabilità delle emissioni PDF per contenitore.

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
      'commerciale_revoca_default',
      'commerciale_provvigione_set',
      'profile_create_test',
      'operatore_iban_set',
      'albero_layout_set',
      'ordine_processa',
      'ordine_inserisci_scaletta',
      'presenze_sync',
      'lotto_generate',
      'unita_generate'
    )
  );
