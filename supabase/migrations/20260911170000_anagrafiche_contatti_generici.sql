-- ISO 9001 §7.5: contatti generici aggiuntivi su scheda (non referenti).
-- Il primo telefono/mail/sito resta sulle colonne esistenti; gli extra sono array.
-- Audit e soft delete restano sulla riga anagrafica (created_at/updated_by/deleted_at).

alter table public.clienti
  add column if not exists telefoni_generici text[] not null default '{}',
  add column if not exists email_generiche text[] not null default '{}',
  add column if not exists siti_web_generici text[] not null default '{}';

alter table public.clienti_possibili
  add column if not exists telefoni_generici text[] not null default '{}',
  add column if not exists email_generiche text[] not null default '{}',
  add column if not exists siti_web_generici text[] not null default '{}';

comment on column public.clienti.telefoni_generici is
  'Telefoni generici aziendali extra (non referenti). ISO 9001: dati di sede, non persone.';
comment on column public.clienti.email_generiche is
  'Mail generiche aziendali extra (info@, ufficio@…). Non mail di referenti.';
comment on column public.clienti.siti_web_generici is
  'Siti web aziendali extra. Non profili personali di referenti.';
comment on column public.clienti_possibili.telefoni_generici is
  'Telefoni generici extra del possibile cliente (non referenti).';
comment on column public.clienti_possibili.email_generiche is
  'Mail generiche extra del possibile cliente (non referenti).';
comment on column public.clienti_possibili.siti_web_generici is
  'Siti web extra del possibile cliente.';
