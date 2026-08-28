-- Amplia MIME ammessi bucket webmail-allegati (jpg non standard, bmp, ico, …)

update storage.buckets
set
  allowed_mime_types = array[
    'image/jpeg', 'image/jpg', 'image/pjpeg', 'image/png', 'image/x-png',
    'image/webp', 'image/gif', 'image/svg+xml', 'image/bmp', 'image/x-ms-bmp',
    'image/tiff', 'image/vnd.microsoft.icon', 'image/x-icon',
    'application/pdf', 'application/x-pdf',
    'application/msword',
    'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    'application/vnd.ms-excel',
    'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    'application/rtf',
    'text/plain',
    'text/html',
    'text/csv',
    'application/zip',
    'application/octet-stream'
  ]::text[],
  file_size_limit = 26214400,
  public = false
where id = 'webmail-allegati';
