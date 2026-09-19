-- Ticket: qualsiasi tipo/dimensione (fino a 500 MB).
update storage.buckets
set
  public = false,
  file_size_limit = 524288000,
  allowed_mime_types = null
where id = 'ticket-gestionale';

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
select
  'ticket-gestionale',
  'ticket-gestionale',
  false,
  524288000,
  null
where not exists (
  select 1 from storage.buckets where id = 'ticket-gestionale'
);
