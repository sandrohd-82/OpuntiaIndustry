-- WebMail: cartella Spam (distinta da In arrivo, categorie e cestino)
alter table public.webmail_messaggi
  add column if not exists spam_at timestamptz,
  add column if not exists spam_by uuid references auth.users (id) on delete set null;

comment on column public.webmail_messaggi.spam_at is
  'Mail in Spam. Soft-state: non elimina; ripristinabile in In arrivo. Audit: spam_by + updated_by.';

create index if not exists webmail_messaggi_spam_idx
  on public.webmail_messaggi (account_id, spam_at desc)
  where deleted_at is null and spam_at is not null;
