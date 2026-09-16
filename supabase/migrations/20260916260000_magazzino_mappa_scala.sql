-- Mappa Magazzino: scala reale del quadrato di griglia (ISO 9001).

alter table public.magazzino_mappe
  add column if not exists scala_valore numeric(12, 3) not null default 10;

alter table public.magazzino_mappe
  add column if not exists scala_unita text not null default 'cm';

alter table public.magazzino_mappe
  drop constraint if exists mag_mappe_scala_unita_check;

alter table public.magazzino_mappe
  add constraint mag_mappe_scala_unita_check
  check (scala_unita in ('cm', 'm'));

alter table public.magazzino_mappe
  drop constraint if exists mag_mappe_scala_valore_check;

alter table public.magazzino_mappe
  add constraint mag_mappe_scala_valore_check
  check (scala_valore > 0 and scala_valore <= 10000);

comment on column public.magazzino_mappe.scala_valore is
  'Lunghezza reale di un quadrato di griglia';
comment on column public.magazzino_mappe.scala_unita is
  'Unità della scala: cm o m';

notify pgrst, 'reload schema';
