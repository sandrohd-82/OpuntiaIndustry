-- Avatar profilo per chat (URL pubblico o path Storage)

alter table public.profiles
  add column if not exists avatar_url text;

comment on column public.profiles.avatar_url is
  'URL immagine profilo (chat avatar). Se null si usano le iniziali.';
