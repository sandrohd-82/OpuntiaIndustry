-- Conteggi In arrivo / spam / categorie senza limite righe (ISO: sola lettura).
-- Il fetch a 8000 righe escludeva le mail nuove: il pallino restava vuoto col totale vecchio.

create or replace function public.webmail_account_folder_counts(p_account_id uuid)
returns table (
  bucket text,
  categoria_id uuid,
  unread bigint,
  total bigint
)
language sql
stable
security invoker
set search_path = public
as $$
  select
    case
      when m.spam_at is not null or upper(coalesce(m.folder, '')) = 'JUNK' then 'spam'
      when m.categoria_id is null then 'inbox'
      else 'categoria'
    end as bucket,
    m.categoria_id,
    count(*) filter (where coalesce(m.is_seen, false) is not true)::bigint as unread,
    count(*)::bigint as total
  from public.webmail_messaggi m
  where m.account_id = p_account_id
    and m.direction = 'inbound'
    and m.deleted_at is null
    and m.archived_at is null
    and m.purged_at is null
    and coalesce(m.folder, '') <> 'TRASH'
  group by 1, 2;
$$;

comment on function public.webmail_account_folder_counts(uuid) is
  'Conteggi totali e non lette per cartelle webmail della casella.';

grant execute on function public.webmail_account_folder_counts(uuid)
  to authenticated, service_role;
