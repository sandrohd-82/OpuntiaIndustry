-- Il commerciale e l'affiancato sono la persona in organigramma.
-- Il login (auth.users) si collega dopo, quando il profilo è pronto.

alter table public.clienti
  add column if not exists commerciale_persona_id uuid references public.organigramma_persone (id) on delete set null,
  add column if not exists affiancato_persona_id uuid references public.organigramma_persone (id) on delete set null;

alter table public.clienti_possibili
  add column if not exists commerciale_persona_id uuid references public.organigramma_persone (id) on delete set null,
  add column if not exists affiancato_persona_id uuid references public.organigramma_persone (id) on delete set null;

create index if not exists clienti_commerciale_persona_id_idx
  on public.clienti (commerciale_persona_id);

create index if not exists clienti_affiancato_persona_id_idx
  on public.clienti (affiancato_persona_id);

create index if not exists clienti_possibili_commerciale_persona_id_idx
  on public.clienti_possibili (commerciale_persona_id);

create index if not exists clienti_possibili_affiancato_persona_id_idx
  on public.clienti_possibili (affiancato_persona_id);

comment on column public.clienti.commerciale_persona_id is
  'Persona organigramma titolare della scheda. Vale anche senza login; commerciale_id si compila al collegamento del profilo.';

comment on column public.clienti.affiancato_persona_id is
  'Persona organigramma affiancata. Vale anche senza login; affiancato_id si compila al collegamento del profilo.';

comment on column public.clienti_possibili.commerciale_persona_id is
  'Persona organigramma titolare del possibile cliente, anche senza login.';

comment on column public.clienti_possibili.affiancato_persona_id is
  'Persona organigramma affiancata sul possibile cliente, anche senza login.';
