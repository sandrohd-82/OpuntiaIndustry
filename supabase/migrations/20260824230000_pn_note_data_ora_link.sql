-- Note: collegamento a promemoria e attività (evento)

alter table public.pn_note
  add column if not exists linked_promemoria_id uuid
    references public.pn_promemoria (id) on delete set null,
  add column if not exists linked_attivita_id uuid
    references public.pn_attivita (id) on delete set null;

create index if not exists pn_note_linked_promemoria_idx
  on public.pn_note (linked_promemoria_id)
  where deleted_at is null and linked_promemoria_id is not null;

create index if not exists pn_note_linked_attivita_idx
  on public.pn_note (linked_attivita_id)
  where deleted_at is null and linked_attivita_id is not null;

comment on column public.pn_note.due_at is
  'Data/ora opzionale della nota (da pulsante Aggiungi data e/o ora)';
comment on column public.pn_note.linked_promemoria_id is
  'Promemoria collegato alla nota (creato o scelto)';
comment on column public.pn_note.linked_attivita_id is
  'Evento/attività collegato alla nota (creato o scelto)';
