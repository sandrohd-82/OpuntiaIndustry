-- Argomenti: first_opened_at per membro + evidenza "nuovo" fino al primo accesso
-- ISO 9001: tracciabilità apertura per utente (persistente, soft state)

alter table public.chat_topic_members
  add column if not exists first_opened_at timestamptz;

comment on column public.chat_topic_members.first_opened_at is
  'Primo accesso dell’utente all’argomento. NULL = mai aperto → evidenza sidebar.';

-- Creator: già "aperto". Altri membri già esistenti: NULL (evidenza fino al primo ingresso).
-- Nuovi topic: gestiti da create_chat_topic aggiornata sotto.
update public.chat_topic_members m
set first_opened_at = coalesce(m.first_opened_at, m.created_at)
where m.ruolo = 'owner'
  and m.deleted_at is null
  and m.first_opened_at is null;

create or replace function public.create_chat_topic(
  p_titolo text,
  p_member_ids uuid[]
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_me uuid := auth.uid();
  v_id uuid;
  v_titolo text := trim(p_titolo);
  v_uid uuid;
begin
  if v_me is null then
    raise exception 'not_authenticated' using errcode = 'P0001';
  end if;
  if v_titolo is null or char_length(v_titolo) < 1 or char_length(v_titolo) > 100 then
    raise exception 'titolo_invalido' using errcode = 'P0001';
  end if;

  insert into public.chat_topics (titolo, stato, created_by, updated_by)
  values (v_titolo, 'attivo', v_me, v_me)
  returning id into v_id;

  -- Creator: first_opened_at = now() (nessuna evidenza "nuovo" per sé)
  insert into public.chat_topic_members (
    topic_id, user_id, ruolo, created_by, first_opened_at
  )
  values (v_id, v_me, 'owner', v_me, now());

  if p_member_ids is not null then
    foreach v_uid in array p_member_ids loop
      if v_uid is distinct from v_me
         and not exists (
           select 1 from public.chat_topic_members m
           where m.topic_id = v_id and m.user_id = v_uid and m.deleted_at is null
         ) then
        insert into public.chat_topic_members (
          topic_id, user_id, ruolo, created_by, first_opened_at
        )
        values (v_id, v_uid, 'member', v_me, null);
      end if;
    end loop;
  end if;

  return v_id;
end;
$$;

grant execute on function public.create_chat_topic(text, uuid[]) to authenticated;

-- Lista argomenti dell’utente corrente con flag is_new
create or replace function public.list_my_active_chat_topics()
returns table (
  id uuid,
  titolo text,
  stato text,
  created_at timestamptz,
  updated_at timestamptz,
  is_new boolean
)
language sql
stable
security invoker
set search_path = public
as $$
  select
    t.id,
    t.titolo,
    t.stato,
    t.created_at,
    t.updated_at,
    (m.first_opened_at is null) as is_new
  from public.chat_topic_members m
  join public.chat_topics t on t.id = m.topic_id
  where m.user_id = auth.uid()
    and m.deleted_at is null
    and t.deleted_at is null
    and t.stato = 'attivo'
  order by
    (m.first_opened_at is null) desc,
    t.updated_at desc;
$$;

grant execute on function public.list_my_active_chat_topics() to authenticated;

-- Primo accesso: setta first_opened_at una sola volta (idempotente)
create or replace function public.mark_chat_topic_opened(p_topic_id uuid)
returns boolean
language plpgsql
security definer
set search_path = public
as $$
declare
  n integer;
begin
  if auth.uid() is null then
    raise exception 'not_authenticated' using errcode = 'P0001';
  end if;
  if not public.is_chat_topic_member(p_topic_id) then
    raise exception 'not_participant' using errcode = 'P0001';
  end if;

  update public.chat_topic_members
  set first_opened_at = now()
  where topic_id = p_topic_id
    and user_id = auth.uid()
    and deleted_at is null
    and first_opened_at is null;

  get diagnostics n = row_count;
  return n > 0;
end;
$$;

grant execute on function public.mark_chat_topic_opened(uuid) to authenticated;

-- Realtime: membership changes (nuovo argomento / primo accesso)
do $$
begin
  alter publication supabase_realtime add table public.chat_topic_members;
exception
  when duplicate_object then null;
  when undefined_object then null;
end $$;

alter table public.chat_topic_members replica identity full;
