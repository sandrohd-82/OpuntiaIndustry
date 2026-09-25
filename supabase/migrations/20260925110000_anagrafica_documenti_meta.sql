-- Metadati facoltativi documenti cliente: data, scadenza, origine, collegamento.

alter table public.anagrafica_documenti
  add column if not exists data_documento date,
  add column if not exists data_scadenza date,
  add column if not exists ricevuto_via text not null default 'non_specificato',
  add column if not exists webmail_messaggio_id uuid references public.webmail_messaggi (id) on delete set null,
  add column if not exists collegamento_etichetta text not null default '',
  add column if not exists collegamento_url text not null default '';

alter table public.anagrafica_documenti
  drop constraint if exists anagrafica_documenti_ricevuto_via_check;
alter table public.anagrafica_documenti
  add constraint anagrafica_documenti_ricevuto_via_check
  check (ricevuto_via in ('non_specificato', 'mail', 'altro'));

alter table public.anagrafica_documenti
  drop constraint if exists anagrafica_documenti_date_check;
alter table public.anagrafica_documenti
  add constraint anagrafica_documenti_date_check
  check (
    data_scadenza is null
    or data_documento is null
    or data_scadenza >= data_documento
  );

create index if not exists anagrafica_documenti_scadenza_idx
  on public.anagrafica_documenti (data_scadenza)
  where deleted_at is null and data_scadenza is not null;

create index if not exists anagrafica_documenti_webmail_idx
  on public.anagrafica_documenti (webmail_messaggio_id)
  where deleted_at is null and webmail_messaggio_id is not null;

comment on column public.anagrafica_documenti.data_documento is
  'Data del documento (facoltativa).';
comment on column public.anagrafica_documenti.data_scadenza is
  'Scadenza facoltativa (contratti, concordati).';
comment on column public.anagrafica_documenti.ricevuto_via is
  'Origine: non_specificato, mail, altro.';
comment on column public.anagrafica_documenti.webmail_messaggio_id is
  'Mail collegata, se ricevuto via webmail.';
