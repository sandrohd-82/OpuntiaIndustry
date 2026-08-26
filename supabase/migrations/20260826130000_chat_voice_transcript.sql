-- Trascrizione note vocali chat 1:1 (ISO 9001: audit chi/quando + stato)
-- Fonte audio: messages.audio_url (bucket voice_notes)

alter table public.messages
  add column if not exists transcript_text text,
  add column if not exists transcript_status text
    check (
      transcript_status is null
      or transcript_status in ('pending', 'done', 'error')
    ),
  add column if not exists transcript_at timestamptz,
  add column if not exists transcript_by uuid references auth.users (id) on delete set null,
  add column if not exists transcript_model text,
  add column if not exists transcript_error text;

comment on column public.messages.transcript_text is
  'Testo STT (Whisper) della nota vocale; per lettura/ricerca/export';
comment on column public.messages.transcript_status is
  'Stato trascrizione: pending | done | error';
comment on column public.messages.transcript_at is
  'Momento completamento/errore trascrizione';
comment on column public.messages.transcript_by is
  'Utente che ha richiesto la trascrizione';
comment on column public.messages.transcript_model is
  'Modello STT usato (es. whisper-1)';
comment on column public.messages.transcript_error is
  'Messaggio errore ultima trascrizione (se status=error)';

create index if not exists messages_transcript_status_idx
  on public.messages (transcript_status)
  where audio_url is not null;
