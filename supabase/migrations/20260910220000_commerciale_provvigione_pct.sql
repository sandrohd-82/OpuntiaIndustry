-- ISO 9001: percentuale di provvigione sulla scheda Commerciale (opzione A).
-- Una % corrente sulla persona/profilo; le statistiche la applicano a tutto lo storico.

alter table public.organigramma_persone
  add column if not exists commerciale_provvigione_pct numeric(5, 2);

do $$ begin
  alter table public.organigramma_persone
    add constraint organigramma_persone_provvigione_pct_chk
    check (
      commerciale_provvigione_pct is null
      or (
        commerciale_provvigione_pct >= 0
        and commerciale_provvigione_pct <= 100
      )
    );
exception
  when duplicate_object then null;
end $$;

comment on column public.organigramma_persone.commerciale_provvigione_pct is
  'Provvigione % vigente del commerciale (0–100). Applicata alle fatture delle aziende collegate.';

alter table public.profiles
  add column if not exists commerciale_provvigione_pct numeric(5, 2);

do $$ begin
  alter table public.profiles
    add constraint profiles_provvigione_pct_chk
    check (
      commerciale_provvigione_pct is null
      or (
        commerciale_provvigione_pct >= 0
        and commerciale_provvigione_pct <= 100
      )
    );
exception
  when duplicate_object then null;
end $$;

comment on column public.profiles.commerciale_provvigione_pct is
  'Provvigione % allineata alla scheda organigramma Commerciale.';

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
      'profile_create_test'
    )
  );
