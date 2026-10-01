-- Nota operativa legata al prodotto della riga ordine (ISO 9001: informazione registrata sulla riga).
alter table public.ordini_righe
  add column if not exists note text not null default '';

comment on column public.ordini_righe.note is
  'Nota legata al prodotto della riga (es. granulometria). Distinta dalla nota di testata ordine.';
