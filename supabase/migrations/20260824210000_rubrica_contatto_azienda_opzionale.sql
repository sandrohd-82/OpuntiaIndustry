-- Rubrica: azienda opzionale (nessuna) fino al collegamento successivo

alter table public.rubrica_contatti
  drop constraint if exists rubrica_contatti_azienda_tipo_check;

alter table public.rubrica_contatti
  add constraint rubrica_contatti_azienda_tipo_check
  check (
    azienda_tipo in (
      'nessuna',
      'cliente',
      'fornitore',
      'cliente_possibile',
      'agrinsicilia'
    )
  );

alter table public.rubrica_contatti
  alter column azienda_tipo set default 'nessuna';

comment on column public.rubrica_contatti.note is
  'Nota libera sul contatto (es. conosciuto al Sana)';
