-- ISO 9001: storico giornaliero timbrature Dipendenti in Cloud (TeamSystem).
-- Soft delete, audit, nessuna cancellazione fisica. Upsert per giorno + match_key.

create table if not exists public.dipendenti_presenze (
  id uuid primary key default gen_random_uuid(),
  giorno date not null,
  match_key text not null,
  dipendente_esterno_id text,
  nome text not null default '',
  cognome text not null default '',
  nome_completo text not null default '',
  codice_fiscale text not null default '',
  persona_id uuid references public.organigramma_persone (id) on delete set null,
  ingresso_at timestamptz,
  uscita_at timestamptz,
  minuti_lavorati integer not null default 0,
  stato text not null default 'assente'
    check (stato in ('presente', 'uscito', 'assente', 'anomalia')),
  documento_stato text not null default 'approvato'
    check (documento_stato in ('bozza', 'approvato', 'chiuso')),
  versione integer not null default 1,
  raw jsonb not null default '{}'::jsonb,
  last_synced_at timestamptz not null default now(),
  created_by uuid references auth.users (id) on delete set null,
  updated_by uuid references auth.users (id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz,
  deleted_by uuid references auth.users (id) on delete set null
);

comment on table public.dipendenti_presenze is
  'Storico giornaliero timbrature (ingresso/uscita) da Dipendenti in Cloud.';
comment on column public.dipendenti_presenze.match_key is
  'Chiave upsert stabile: cf:{codice_fiscale} oppure ext:{id esterno}.';
comment on column public.dipendenti_presenze.stato is
  'presente = in azienda, uscito = giornata chiusa, assente = nessuna timbratura, anomalia = dati incoerenti.';

create unique index if not exists dipendenti_presenze_giorno_match_uidx
  on public.dipendenti_presenze (giorno, match_key)
  where deleted_at is null;

create index if not exists dipendenti_presenze_giorno_idx
  on public.dipendenti_presenze (giorno desc)
  where deleted_at is null;

create index if not exists dipendenti_presenze_cf_idx
  on public.dipendenti_presenze (codice_fiscale)
  where deleted_at is null and codice_fiscale <> '';

create index if not exists dipendenti_presenze_persona_idx
  on public.dipendenti_presenze (persona_id)
  where deleted_at is null and persona_id is not null;

drop trigger if exists dipendenti_presenze_updated_at on public.dipendenti_presenze;
create trigger dipendenti_presenze_updated_at
  before update on public.dipendenti_presenze
  for each row execute function public.set_updated_at();

alter table public.dipendenti_presenze enable row level security;

drop policy if exists dipendenti_presenze_select on public.dipendenti_presenze;
create policy dipendenti_presenze_select
  on public.dipendenti_presenze for select to authenticated
  using (
    public.has_area_access('amministrazione')
    or public.has_area_access('hr')
    or public.is_superadmin()
  );

drop policy if exists dipendenti_presenze_write on public.dipendenti_presenze;
create policy dipendenti_presenze_write
  on public.dipendenti_presenze for insert to authenticated
  with check (public.is_admin() or public.is_superadmin());

drop policy if exists dipendenti_presenze_update on public.dipendenti_presenze;
create policy dipendenti_presenze_update
  on public.dipendenti_presenze for update to authenticated
  using (public.is_admin() or public.is_superadmin())
  with check (public.is_admin() or public.is_superadmin());

grant select on table public.dipendenti_presenze to authenticated;
grant insert, update on table public.dipendenti_presenze to authenticated;
grant all on table public.dipendenti_presenze to postgres, service_role;
revoke delete on table public.dipendenti_presenze from authenticated;

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
      'presenze_sync'
    )
  );
