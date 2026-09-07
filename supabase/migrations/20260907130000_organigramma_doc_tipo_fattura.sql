-- Storico fatture e buste paga: tipo fattura per operatori esterni a contratto.

alter table public.organigramma_documenti
  drop constraint if exists organigramma_documenti_tipo_check;

alter table public.organigramma_documenti
  add constraint organigramma_documenti_tipo_check
  check (tipo in (
    'cf_fronte', 'cf_retro', 'ci_fronte', 'ci_retro',
    'corso', 'certificato', 'busta_paga', 'fattura', 'altro'
  ));

comment on column public.organigramma_documenti.tipo is
  'fattura = operatore esterno a contratto; busta_paga = operatore ingaggiato in azienda.';
