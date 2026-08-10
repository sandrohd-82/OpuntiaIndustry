-- Profili operatori: nome, cognome, ruolo aziendale (ISO anagrafica utenti)
-- Aggiorna i tre operatori noti senza cancellare nulla

alter table public.profiles
  add column if not exists first_name text not null default '',
  add column if not exists last_name text not null default '',
  add column if not exists job_title text not null default '';

comment on column public.profiles.first_name is 'Nome operatore (visualizzazione audit: iniziale)';
comment on column public.profiles.last_name is 'Cognome operatore';
comment on column public.profiles.job_title is
  'Ruolo aziendale (es. Vicepresidente, Responsabile R&S) — distinto da app_roles';

-- Backfill da full_name se nome/cognome ancora vuoti
update public.profiles p
set
  first_name = case
    when coalesce(btrim(p.first_name), '') <> '' then p.first_name
    when position(' ' in btrim(coalesce(p.full_name, ''))) > 0
      then split_part(btrim(p.full_name), ' ', 1)
    else coalesce(btrim(p.full_name), '')
  end,
  last_name = case
    when coalesce(btrim(p.last_name), '') <> '' then p.last_name
    when position(' ' in btrim(coalesce(p.full_name, ''))) > 0
      then btrim(substring(btrim(p.full_name) from position(' ' in btrim(p.full_name)) + 1))
    else ''
  end
where coalesce(btrim(p.first_name), '') = ''
   or coalesce(btrim(p.last_name), '') = '';

-- Operatori noti
update public.profiles
set
  first_name = 'Sandro',
  last_name = 'Incorvaia',
  job_title = 'Vicepresidente',
  full_name = 'Sandro Incorvaia'
where lower(email) = 'sandrohd@gmail.com';

update public.profiles
set
  first_name = 'Angelo',
  last_name = 'Incorvaia',
  job_title = 'Vicepresidente',
  full_name = 'Angelo Incorvaia'
where lower(email) = 'angeloincorvaia79@gmail.com';

update public.profiles
set
  first_name = 'Titta',
  last_name = 'Platamone',
  job_title = 'Responsabile R&S',
  full_name = 'Titta Platamone'
where lower(email) = 'titta@agrinsicilia.com';
