-- Ticket: allegati con MIME inferito e policy storage (ISO 7.5).
-- Il bucket rifiutava tipi comuni (image/jpg, MIME vuoto, codec audio).

update storage.buckets
set
  file_size_limit = 15728640,
  allowed_mime_types = null
where id = 'ticket-gestionale';

drop policy if exists ticket_gestionale_storage_select on storage.objects;
create policy ticket_gestionale_storage_select
  on storage.objects for select to authenticated
  using (
    bucket_id = 'ticket-gestionale'
    and (
      public.is_superadmin()
      or public.has_area_access('amministrazione')
      or public.has_area_access('strumenti')
    )
  );

drop policy if exists ticket_gestionale_storage_insert on storage.objects;
create policy ticket_gestionale_storage_insert
  on storage.objects for insert to authenticated
  with check (
    bucket_id = 'ticket-gestionale'
    and (
      public.is_superadmin()
      or public.has_area_access('amministrazione')
      or public.has_area_access('strumenti')
    )
  );

drop policy if exists ticket_gestionale_storage_update on storage.objects;
create policy ticket_gestionale_storage_update
  on storage.objects for update to authenticated
  using (
    bucket_id = 'ticket-gestionale'
    and (
      public.is_superadmin()
      or public.has_area_access('amministrazione')
    )
  )
  with check (
    bucket_id = 'ticket-gestionale'
    and (
      public.is_superadmin()
      or public.has_area_access('amministrazione')
    )
  );
