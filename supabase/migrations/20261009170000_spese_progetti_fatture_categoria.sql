-- Categoria della fattura nel pacchetto. Non modifica la fattura SDI.

alter table public.spese_progetti_fatture
  add column if not exists categoria text;

alter table public.spese_progetti_fatture
  drop constraint if exists spese_progetti_fatture_categoria_chk;

alter table public.spese_progetti_fatture
  add constraint spese_progetti_fatture_categoria_chk
  check (
    categoria is null
    or categoria in (
      'vitto',
      'alloggio',
      'trasporti',
      'carburante_automezzi',
      'carburante_impianti',
      'cancelleria',
      'ufficio',
      'altro'
    )
  );

comment on column public.spese_progetti_fatture.categoria is
  'Categoria di spesa usata solo nel totale del progetto. Null finché l''operatore non la indica.';

notify pgrst, 'reload schema';
