-- Campionatura verso un commerciale (pezzi, indirizzo dalla scheda)
-- e residenza completa su ogni scheda operatore. ISO 9001 §7.5 / §8.5.2.

alter table public.organigramma_persone
  add column if not exists residenza_indirizzo text not null default '',
  add column if not exists residenza_cap text not null default '',
  add column if not exists residenza_citta text not null default '',
  add column if not exists residenza_provincia text not null default '',
  add column if not exists residenza_nazione text not null default '';

comment on column public.organigramma_persone.residenza_indirizzo is
  'Via e civico di residenza dell''operatore';
comment on column public.organigramma_persone.residenza_cap is
  'CAP di residenza';
comment on column public.organigramma_persone.residenza_citta is
  'Città di residenza';
comment on column public.organigramma_persone.residenza_provincia is
  'Provincia di residenza';
comment on column public.organigramma_persone.residenza_nazione is
  'Paese di residenza';

alter table public.campionature
  add column if not exists destinazione text not null default 'azienda',
  add column if not exists commerciale_persona_id uuid
    references public.organigramma_persone (id) on delete set null;

alter table public.campionature
  drop constraint if exists campionature_destinazione_check;
alter table public.campionature
  add constraint campionature_destinazione_check
  check (destinazione in ('azienda', 'commerciale'));

comment on column public.campionature.destinazione is
  'azienda = invio al cliente; commerciale = pezzi verso la residenza in scheda operatore';
comment on column public.campionature.commerciale_persona_id is
  'Commerciale destinatario quando destinazione = commerciale';

create index if not exists campionature_commerciale_idx
  on public.campionature (commerciale_persona_id)
  where deleted_at is null and commerciale_persona_id is not null;
