-- Affiancamento commerciale: il titolare resta, un sottoposto vede e lavora la scheda.
-- La cessione continua a usare commerciale_id. Un solo affiancato per scheda.

alter table public.clienti
  add column if not exists affiancato_id uuid references auth.users (id) on delete set null,
  add column if not exists affiancato_at timestamptz,
  add column if not exists affiancato_by uuid;

alter table public.clienti_possibili
  add column if not exists affiancato_id uuid references auth.users (id) on delete set null,
  add column if not exists affiancato_at timestamptz,
  add column if not exists affiancato_by uuid;

create index if not exists clienti_affiancato_id_idx
  on public.clienti (affiancato_id);

create index if not exists clienti_possibili_affiancato_id_idx
  on public.clienti_possibili (affiancato_id);

comment on column public.clienti.affiancato_id is
  'Commerciale affiancato dal Senior o dal Professional. Il titolare resta commerciale_id.';

comment on column public.clienti.affiancato_at is
  'Quando è stato registrato l''affiancamento corrente.';

comment on column public.clienti.affiancato_by is
  'Utente che ha registrato l''affiancamento corrente.';

comment on column public.clienti_possibili.affiancato_id is
  'Commerciale affiancato sul possibile cliente. In promozione si copia sul cliente.';

comment on column public.clienti_possibili.affiancato_at is
  'Quando è stato registrato l''affiancamento corrente.';

comment on column public.clienti_possibili.affiancato_by is
  'Utente che ha registrato l''affiancamento corrente.';
