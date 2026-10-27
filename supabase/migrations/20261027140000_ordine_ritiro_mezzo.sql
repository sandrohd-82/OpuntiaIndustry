-- Ritiro in sede: mezzo del cliente e avviso quando la merce è pronta.
-- Il catalogo corrieri (UPS e simili) non si usa in questo caso.

alter table public.ordini
  add column if not exists ritiro_mezzo text;

alter table public.ordini
  drop constraint if exists ordini_ritiro_mezzo_check;

alter table public.ordini
  add constraint ordini_ritiro_mezzo_check
  check (ritiro_mezzo is null or ritiro_mezzo in ('personalmente', 'corriere_cliente'));

alter table public.ordini
  add column if not exists avvisa_merce_pronta boolean not null default false;

alter table public.ordini
  add column if not exists avviso_canale text;

alter table public.ordini
  drop constraint if exists ordini_avviso_canale_check;

alter table public.ordini
  add constraint ordini_avviso_canale_check
  check (avviso_canale is null or avviso_canale in ('tel', 'mail'));

alter table public.ordini
  add column if not exists avviso_valore text not null default '';

alter table public.ordini
  add column if not exists avviso_etichetta text not null default '';

comment on column public.ordini.ritiro_mezzo is
  'Con ritiro in sede: personalmente oppure corriere del cliente. Il catalogo corrieri non si usa.';

comment on column public.ordini.avvisa_merce_pronta is
  'Avvisare il cliente appena la merce è pronta a magazzino.';

comment on column public.ordini.avviso_canale is
  'Tel o mail per l''avviso di merce pronta.';

comment on column public.ordini.avviso_valore is
  'Numero o mail scelti per l''avviso.';

comment on column public.ordini.avviso_etichetta is
  'Chi è il contatto scelto: azienda o referente.';
