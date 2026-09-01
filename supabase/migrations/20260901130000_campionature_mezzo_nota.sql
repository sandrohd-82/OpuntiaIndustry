-- Campionatura: canale richiesta + collegamento Nota (timeline) e mail
-- ISO 9001 §8.5.2 tracciabilità conversazione ↔ documento

alter table public.campionature
  add column if not exists mezzo text,
  add column if not exists pn_nota_id uuid references public.pn_note (id) on delete set null,
  add column if not exists webmail_messaggio_id uuid
    references public.webmail_messaggi (id) on delete set null;

do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conname = 'campionature_mezzo_check'
  ) then
    alter table public.campionature
      add constraint campionature_mezzo_check
      check (
        mezzo is null
        or mezzo in ('mail', 'messaggio', 'chiamata', 'in_presenza')
      );
  end if;
end $$;

comment on column public.campionature.mezzo is
  'Canale della richiesta: mail, messaggio, chiamata, in_presenza';
comment on column public.campionature.pn_nota_id is
  'Nota timeline collegata (obbligatoria in applicazione)';
comment on column public.campionature.webmail_messaggio_id is
  'Mail WebMail collegata se mezzo = mail (opzionale)';

create index if not exists campionature_nota_idx
  on public.campionature (pn_nota_id)
  where deleted_at is null and pn_nota_id is not null;

alter table public.pn_note
  add column if not exists linked_campionatura_id uuid
    references public.campionature (id) on delete set null;

create index if not exists pn_note_linked_campionatura_idx
  on public.pn_note (linked_campionatura_id)
  where deleted_at is null and linked_campionatura_id is not null;

comment on column public.pn_note.linked_campionatura_id is
  'Campionatura collegata alla nota (timeline ↔ documento)';
