-- Presa visione: informativa privacy e condizioni di vendita sullo stesso link.
-- I PDF firmati restano collegati all'azienda. In fase test si possono ancora ritirare.

alter table public.anagrafica_documenti
  drop constraint if exists anagrafica_documenti_tipo_check;

alter table public.anagrafica_documenti
  add constraint anagrafica_documenti_tipo_check
  check (
    tipo in (
      'contratto',
      'concordato',
      'meeting_resume',
      'nda',
      'altro',
      'anagrafica_aziendale',
      'informativa_privacy',
      'condizioni_vendita'
    )
  );

alter table public.anagrafica_richieste
  add column if not exists passo text not null default 'anagrafica',
  add column if not exists privacy_firmatario text not null default '',
  add column if not exists privacy_accetto boolean not null default false,
  add column if not exists privacy_consenso_marketing text not null default '',
  add column if not exists privacy_firmata_at timestamptz,
  add column if not exists privacy_firma_email text not null default '',
  add column if not exists privacy_firma_ip text not null default '',
  add column if not exists privacy_firma_hash text not null default '',
  add column if not exists privacy_storage_path text not null default '',
  add column if not exists privacy_file_name text not null default '',
  add column if not exists condizioni_firmatario text not null default '',
  add column if not exists condizioni_accetto boolean not null default false,
  add column if not exists condizioni_firmata_at timestamptz,
  add column if not exists condizioni_firma_email text not null default '',
  add column if not exists condizioni_firma_ip text not null default '',
  add column if not exists condizioni_firma_hash text not null default '',
  add column if not exists condizioni_storage_path text not null default '',
  add column if not exists condizioni_file_name text not null default '';

update public.anagrafica_richieste
set passo = 'completato'
where stato in ('COMPLETED', 'firmata')
  and passo = 'anagrafica';

alter table public.anagrafica_richieste
  drop constraint if exists anagrafica_richieste_passo_check;

alter table public.anagrafica_richieste
  add constraint anagrafica_richieste_passo_check
  check (passo in ('anagrafica', 'privacy', 'condizioni', 'completato'));

alter table public.anagrafica_richieste
  drop constraint if exists anagrafica_richieste_privacy_marketing_check;

alter table public.anagrafica_richieste
  add constraint anagrafica_richieste_privacy_marketing_check
  check (privacy_consenso_marketing in ('', 'presto', 'nego'));

comment on column public.anagrafica_richieste.passo is
  'Passo del link unico: anagrafica, privacy, condizioni, completato.';

alter table public.otp_verifications
  add column if not exists documento text not null default 'anagrafica';

alter table public.otp_verifications
  drop constraint if exists otp_verifications_documento_check;

alter table public.otp_verifications
  add constraint otp_verifications_documento_check
  check (documento in ('anagrafica', 'privacy', 'condizioni'));

comment on column public.otp_verifications.documento is
  'Documento a cui si riferisce il codice: anagrafica, privacy o condizioni.';
