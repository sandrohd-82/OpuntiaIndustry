-- Soft-remove membro da argomento chat (perde accesso RLS).
-- Solo partecipanti attivi possono rimuovere; soft delete ISO 9001.

create or replace function public.remove_chat_topic_member(
  p_topic_id uuid,
  p_user_id uuid
)
returns boolean
language plpgsql
security definer
set search_path = public
as $$
declare
  v_updated int;
begin
  if auth.uid() is null then
    raise exception 'not_authenticated';
  end if;

  if not public.is_chat_topic_member(p_topic_id) then
    raise exception 'not_participant';
  end if;

  update public.chat_topic_members
  set
    deleted_at = now(),
    deleted_by = auth.uid(),
    updated_at = now(),
    updated_by = auth.uid()
  where topic_id = p_topic_id
    and user_id = p_user_id
    and deleted_at is null;

  get diagnostics v_updated = row_count;

  if v_updated > 0 then
    update public.chat_topics
    set updated_at = now(), updated_by = auth.uid()
    where id = p_topic_id
      and deleted_at is null;
  end if;

  return v_updated > 0;
end;
$$;

grant execute on function public.remove_chat_topic_member(uuid, uuid) to authenticated;

comment on function public.remove_chat_topic_member(uuid, uuid) is
  'Soft-delete membro argomento: perde accesso a topic e messaggi (ISO 9001).';
