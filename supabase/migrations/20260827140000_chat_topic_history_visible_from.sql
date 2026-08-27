-- Argomenti: history_visible_from per membro (ISO 9001 — controllo accesso cronologia)
-- NULL = vede tutta la cronologia; timestamptz = solo messaggi da quella data in poi

alter table public.chat_topic_members
  add column if not exists history_visible_from timestamptz;

comment on column public.chat_topic_members.history_visible_from is
  'NULL = accesso a tutta la cronologia; altrimenti solo messaggi con created_at >= questo istante (ingresso senza storia).';

create or replace function public.chat_topic_message_visible(
  p_topic_id uuid,
  p_created_at timestamptz
)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.chat_topic_members m
    where m.topic_id = p_topic_id
      and m.user_id = auth.uid()
      and m.deleted_at is null
      and (
        m.history_visible_from is null
        or p_created_at >= m.history_visible_from
      )
  );
$$;

grant execute on function public.chat_topic_message_visible(uuid, timestamptz)
  to authenticated;

drop policy if exists "chat_topic_messages_select" on public.chat_topic_messages;
create policy "chat_topic_messages_select"
  on public.chat_topic_messages for select to authenticated
  using (
    deleted_at is null
    and public.chat_topic_message_visible(topic_id, created_at)
  );

-- Aggiunge membri con scelta storia (uno o più). Solo partecipanti attivi.
-- p_member_ids e p_see_history devono avere la stessa lunghezza (allineati per indice).
create or replace function public.add_chat_topic_members(
  p_topic_id uuid,
  p_member_ids uuid[],
  p_see_history boolean[]
)
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  v_me uuid := auth.uid();
  v_i integer;
  v_uid uuid;
  v_see boolean;
  v_from timestamptz;
  v_count integer := 0;
begin
  if v_me is null then
    raise exception 'not_authenticated' using errcode = 'P0001';
  end if;
  if not public.is_chat_topic_member(p_topic_id) then
    raise exception 'not_participant' using errcode = 'P0001';
  end if;
  if p_member_ids is null or cardinality(p_member_ids) = 0 then
    return 0;
  end if;
  if p_see_history is null
     or cardinality(p_see_history) <> cardinality(p_member_ids) then
    raise exception 'see_history_mismatch' using errcode = 'P0001';
  end if;

  for v_i in 1 .. cardinality(p_member_ids) loop
    v_uid := p_member_ids[v_i];
    v_see := coalesce(p_see_history[v_i], true);
    if v_uid is null or v_uid = v_me then
      continue;
    end if;

    v_from := case when v_see then null else now() end;

    -- Ripristina soft-deleted o aggiorna se già attivo (idempotente)
    if exists (
      select 1 from public.chat_topic_members m
      where m.topic_id = p_topic_id
        and m.user_id = v_uid
        and m.deleted_at is null
    ) then
      continue;
    end if;

    if exists (
      select 1 from public.chat_topic_members m
      where m.topic_id = p_topic_id
        and m.user_id = v_uid
        and m.deleted_at is not null
    ) then
      update public.chat_topic_members
      set
        deleted_at = null,
        deleted_by = null,
        ruolo = 'member',
        history_visible_from = v_from,
        first_opened_at = null,
        updated_at = now(),
        created_by = coalesce(created_by, v_me)
      where topic_id = p_topic_id
        and user_id = v_uid
        and deleted_at is not null;
      v_count := v_count + 1;
    else
      insert into public.chat_topic_members (
        topic_id,
        user_id,
        ruolo,
        created_by,
        first_opened_at,
        history_visible_from
      )
      values (
        p_topic_id,
        v_uid,
        'member',
        v_me,
        null,
        v_from
      );
      v_count := v_count + 1;
    end if;
  end loop;

  update public.chat_topics
  set updated_at = now(), updated_by = v_me
  where id = p_topic_id
    and deleted_at is null;

  return v_count;
end;
$$;

grant execute on function public.add_chat_topic_members(uuid, uuid[], boolean[])
  to authenticated;

-- Conta messaggi del topic senza filtro history (solo per partecipanti).
create or replace function public.chat_topic_message_count(p_topic_id uuid)
returns integer
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  n integer;
begin
  if not public.is_chat_topic_member(p_topic_id) then
    return 0;
  end if;
  select count(*)::integer into n
  from public.chat_topic_messages m
  where m.topic_id = p_topic_id
    and m.deleted_at is null;
  return coalesce(n, 0);
end;
$$;

grant execute on function public.chat_topic_message_count(uuid) to authenticated;
