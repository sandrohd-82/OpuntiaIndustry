-- ISO 9001 8.5.2: snapshot del commerciale di riferimento sul documento.
-- Soft delete e audit restano sulla testata preventivi.

alter table public.preventivi
  add column if not exists commerciale_riferimento_id uuid references auth.users (id) on delete set null;

alter table public.preventivi
  add column if not exists commerciale_riferimento_nome text not null default '';

alter table public.preventivi
  add column if not exists commerciale_riferimento_telefono text not null default '';

alter table public.preventivi
  add column if not exists commerciale_riferimento_email text not null default '';

comment on column public.preventivi.commerciale_riferimento_id is
  'Utente (commerciale o admin) indicato come riferimento sul preventivo.';
comment on column public.preventivi.commerciale_riferimento_nome is
  'Snapshot nome e cognome al momento della creazione del documento.';
comment on column public.preventivi.commerciale_riferimento_telefono is
  'Snapshot telefono al momento della creazione del documento.';
comment on column public.preventivi.commerciale_riferimento_email is
  'Snapshot email al momento della creazione del documento.';
