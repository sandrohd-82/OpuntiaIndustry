-- ISO 9001: coordinate bancarie opzionali su ogni scheda operatore.
-- IBAN validato in applicazione (forma + MOD-97). Nessun campo obbligatorio.

alter table public.organigramma_persone
  add column if not exists banca_iban text,
  add column if not exists banca_bic text,
  add column if not exists banca_intestatario text;

comment on column public.organigramma_persone.banca_iban is
  'IBAN operatore (opzionale, normalizzato).';
comment on column public.organigramma_persone.banca_bic is
  'BIC/SWIFT opzionale.';
comment on column public.organigramma_persone.banca_intestatario is
  'Intestatario conto, se diverso da nome e cognome.';

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
      'operatore_iban_set'
    )
  );
