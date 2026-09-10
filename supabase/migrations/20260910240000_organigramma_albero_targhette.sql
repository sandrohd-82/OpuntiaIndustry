-- ISO 9001: targhetta e distanza sulle strisce dell'organigramma a cascata.
-- Layout persistente, solo admin, audit su modifica.

alter table public.organigramma_persone
  add column if not exists albero_etichetta text,
  add column if not exists albero_gap_dopo integer not null default 0;

do $$ begin
  alter table public.organigramma_persone
    add constraint organigramma_persone_albero_gap_dopo_chk
    check (albero_gap_dopo >= 0 and albero_gap_dopo <= 8);
exception
  when duplicate_object then null;
end $$;

comment on column public.organigramma_persone.albero_etichetta is
  'Targhetta sulla striscia orizzontale (es. Area commerciale). Vuota = nome reparto.';
comment on column public.organigramma_persone.albero_gap_dopo is
  'Unità di distanza a destra nella riga dell''albero (0–8).';

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
      'albero_layout_set'
    )
  );
