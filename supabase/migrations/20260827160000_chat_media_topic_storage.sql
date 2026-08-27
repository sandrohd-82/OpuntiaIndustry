-- Fix upload allegati/vocali argomenti chat:
-- path topic usava cartella letterale "topic" → cast uuid falliva.
-- Accetta path {userId}/{conversationOrTopicId}/file per 1:1 e argomenti.
-- Amplia mime/size chat_media (doc office + video).

update storage.buckets
set
  file_size_limit = 26214400,
  allowed_mime_types = array[
    'image/jpeg', 'image/png', 'image/webp', 'image/gif',
    'video/mp4', 'video/webm', 'video/quicktime', 'video/x-msvideo',
    'application/pdf',
    'application/msword',
    'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    'application/vnd.ms-excel',
    'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    'application/rtf',
    'text/plain',
    'text/rtf',
    'application/octet-stream'
  ]::text[]
where id = 'chat_media';

drop policy if exists "voice_notes_insert" on storage.objects;
create policy "voice_notes_insert"
  on storage.objects for insert to authenticated
  with check (
    bucket_id = 'voice_notes'
    and (storage.foldername(name))[1] = auth.uid()::text
    and (
      public.is_conversation_participant(((storage.foldername(name))[2])::uuid)
      or public.is_chat_topic_member(((storage.foldername(name))[2])::uuid)
    )
  );

drop policy if exists "chat_media_insert" on storage.objects;
create policy "chat_media_insert"
  on storage.objects for insert to authenticated
  with check (
    bucket_id = 'chat_media'
    and (storage.foldername(name))[1] = auth.uid()::text
    and (
      public.is_conversation_participant(((storage.foldername(name))[2])::uuid)
      or public.is_chat_topic_member(((storage.foldername(name))[2])::uuid)
    )
  );
