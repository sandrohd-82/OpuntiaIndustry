-- Allegati note (timeline / PN): path {userId}/note-allegati/file
-- senza richiedere una conversazione chat (ISO: nessuna cancellazione file).

drop policy if exists "chat_media_insert" on storage.objects;
create policy "chat_media_insert"
  on storage.objects for insert to authenticated
  with check (
    bucket_id = 'chat_media'
    and (storage.foldername(name))[1] = auth.uid()::text
    and (
      (storage.foldername(name))[2] = 'note-allegati'
      or (
        (storage.foldername(name))[2] ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
        and (
          public.is_conversation_participant(((storage.foldername(name))[2])::uuid)
          or public.is_chat_topic_member(((storage.foldername(name))[2])::uuid)
        )
      )
    )
  );
