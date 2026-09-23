-- Nota unica in timeline azienda per scheda ordine (vendita / campionatura).
-- ISO 9001 §8.5.2: un solo documento aggiornato, senza delete fisico.

alter table public.pn_note
  add column if not exists linked_ordine_id uuid
    references public.ordini (id) on delete set null;

alter table public.pn_note
  add column if not exists linked_scheda_id uuid
    references public.produzione_schede_ordini (id) on delete set null;

create index if not exists pn_note_linked_ordine_idx
  on public.pn_note (linked_ordine_id)
  where deleted_at is null and linked_ordine_id is not null;

create index if not exists pn_note_linked_scheda_idx
  on public.pn_note (linked_scheda_id)
  where deleted_at is null and linked_scheda_id is not null;

comment on column public.pn_note.linked_ordine_id is
  'Ordine (anche tipo campionatura) collegato alla nota «Scheda ordine creata».';
comment on column public.pn_note.linked_scheda_id is
  'Scheda ordine: click in timeline apre la scheda; la nota si aggiorna allo stato.';
