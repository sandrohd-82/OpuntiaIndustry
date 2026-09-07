-- Più superiori sullo stesso collaboratore (linea condivisa in albero).
-- parent_id resta il superiore principale; co_parent_ids gli altri.
-- ISO 9001 8.5.2: audit sulla riga persona (updated_at / updated_by).

alter table public.organigramma_persone
  add column if not exists co_parent_ids uuid[] not null default '{}';

comment on column public.organigramma_persone.co_parent_ids is
  'Altri superiori oltre a parent_id. I collaboratori stanno sotto tutti, collegati da una linea.';
