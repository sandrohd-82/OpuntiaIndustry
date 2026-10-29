-- Firma anagrafica via OTP e-mail. Il codice non è salvato in chiaro.
-- SMS non usato: il codice parte solo verso un'e-mail già registrata sulla richiesta.

alter table public.anagrafica_richieste
  drop constraint if exists anagrafica_richieste_stato_check;

alter table public.anagrafica_richieste
  add constraint anagrafica_richieste_stato_check
  check (
    stato in (
      'compilazione',
      'pdf_pronto',
      'firmata',
      'COMPLETED',
      'scaduta',
      'annullata'
    )
  );

alter table public.anagrafica_richieste
  add column if not exists firma_email text not null default '',
  add column if not exists firma_ip text not null default '',
  add column if not exists firma_hash text not null default '';

comment on column public.anagrafica_richieste.firma_email is
  'E-mail a cui è stato inviato il codice OTP usato per la firma.';
comment on column public.anagrafica_richieste.firma_ip is
  'Indirizzo IP visto al momento della verifica OTP.';
comment on column public.anagrafica_richieste.firma_hash is
  'Codice transazione della firma OTP.';

create table if not exists public.otp_verifications (
  id uuid primary key default gen_random_uuid(),
  richiesta_id uuid not null references public.anagrafica_richieste (id),
  email text not null,
  codice_hash text not null,
  stato text not null default 'attivo',
  scade_at timestamptz not null,
  tentativi integer not null default 0,
  verificata_at timestamptz,
  ip_richiesta text not null default '',
  versione integer not null default 1,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  created_by uuid,
  updated_by uuid,
  deleted_at timestamptz,
  deleted_by uuid,
  constraint otp_verifications_stato_check check (
    stato in ('attivo', 'usato', 'scaduto', 'annullato')
  ),
  constraint otp_verifications_tentativi_check check (tentativi >= 0 and tentativi <= 10)
);

create index if not exists otp_verifications_richiesta_idx
  on public.otp_verifications (richiesta_id, created_at desc)
  where deleted_at is null;

drop trigger if exists set_otp_verifications_updated_at on public.otp_verifications;
create trigger set_otp_verifications_updated_at
  before update on public.otp_verifications
  for each row execute function public.set_updated_at();

alter table public.otp_verifications enable row level security;

drop policy if exists otp_verifications_select on public.otp_verifications;
create policy otp_verifications_select on public.otp_verifications
  for select to authenticated
  using (
    deleted_at is null
    and (
      public.is_superadmin()
      or public.has_area_access('amministrazione')
      or public.has_area_access('commerciale')
    )
  );

revoke all on table public.otp_verifications from anon, authenticated;
grant select on table public.otp_verifications to authenticated;
grant all on table public.otp_verifications to service_role;
