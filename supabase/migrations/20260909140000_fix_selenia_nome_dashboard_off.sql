-- Correzione anagrafica profilo Selenia + annulla Off errato su Dashboard
-- (il toggle On/Off usava il path stale del layout).

update public.profiles
set
  full_name = 'Selenia Rita Curella',
  first_name = 'Selenia Rita',
  last_name = 'Curella',
  job_title = 'Segnor',
  gerarchia = 'segnor'
where lower(email) = 'seleniarcurella@gmail.com';

update public.profile_page_access ppa
set
  deleted_at = now(),
  deleted_by = ppa.updated_by
from public.profiles p
where ppa.profile_id = p.id
  and lower(p.email) = 'seleniarcurella@gmail.com'
  and ppa.page_key = '/app/dashboard'
  and ppa.visibile = false
  and ppa.deleted_at is null;

update public.organigramma_persone op
set
  nome = 'Selenia Rita',
  cognome = 'Curella'
from public.profiles p
where op.user_id = p.id
  and lower(p.email) = 'seleniarcurella@gmail.com'
  and op.deleted_at is null;
