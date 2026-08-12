-- Clienti: is_privato + codice_fiscale (ISO 9001)
-- Azienda: P.IVA obbligatoria, CF obbligatorio (backfill = P.IVA)
-- Privato: P.IVA non usata (vuota), CF facoltativo

alter table public.clienti
  add column if not exists is_privato boolean not null default false;

alter table public.clienti
  add column if not exists codice_fiscale text not null default '';

comment on column public.clienti.is_privato is
  'true = cliente privato (persona fisica): P.IVA non compilabile, CF facoltativo';
comment on column public.clienti.codice_fiscale is
  'Codice fiscale; per aziende spesso uguale alla P.IVA';

-- Backfill: aziende già registrate → CF = P.IVA
update public.clienti
set codice_fiscale = trim(partita_iva)
where trim(codice_fiscale) = ''
  and trim(partita_iva) <> '';

-- P.IVA può essere vuota per i privati
alter table public.clienti drop constraint if exists clienti_partita_iva_len;

alter table public.clienti drop constraint if exists clienti_privato_piva_check;
alter table public.clienti
  add constraint clienti_privato_piva_check check (
    (is_privato = true and trim(partita_iva) = '')
    or (is_privato = false and char_length(trim(partita_iva)) >= 1)
  );

alter table public.clienti drop constraint if exists clienti_azienda_cf_check;
alter table public.clienti
  add constraint clienti_azienda_cf_check check (
    is_privato = true
    or char_length(trim(codice_fiscale)) >= 1
  );

create unique index if not exists clienti_codice_fiscale_active_uidx
  on public.clienti (lower(trim(codice_fiscale)))
  where deleted_at is null and trim(codice_fiscale) <> '';

create index if not exists clienti_is_privato_idx
  on public.clienti (is_privato)
  where deleted_at is null;
