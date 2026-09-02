-- Scontistica listino: kg per confezione (standard da imballaggio-prodotto)
-- Se l’operatore supera il max, deve adeguare o forzare (tracciato).

alter table public.listini_righe_condizioni
  add column if not exists kg_confezione numeric(14, 4);

alter table public.listini_righe_condizioni
  add column if not exists kg_standard numeric(14, 4);

alter table public.listini_righe_condizioni
  add column if not exists kg_forzato boolean not null default false;

comment on column public.listini_righe_condizioni.kg_confezione is
  'Kg (o qty nella UM del collegamento) usati per questa condizione. Precompilati dallo standard, modificabili.';
comment on column public.listini_righe_condizioni.kg_standard is
  'Snapshot del max prodotto-confezione al salvataggio.';
comment on column public.listini_righe_condizioni.kg_forzato is
  'True se l’operatore ha forzato un valore sopra lo standard.';

update public.listini_righe_condizioni c
set kg_confezione = coalesce(c.kg_confezione, src.max_kg),
    kg_standard = coalesce(c.kg_standard, src.max_kg)
from (
  select c2.id, l.max_kg
  from public.listini_righe_condizioni c2
  join public.listini_righe r on r.id = c2.listino_riga_id
  join public.imballaggi_voci_prodotti l
    on l.voce_id = c2.imballaggio_voce_id
   and l.prodotto_id = r.prodotto_id
   and l.deleted_at is null
  where c2.deleted_at is null
) src
where c.id = src.id
  and c.kg_confezione is null;

update public.listini_righe_condizioni
set kg_confezione = coalesce(kg_confezione, 0)
where kg_confezione is null;

alter table public.listini_righe_condizioni
  alter column kg_confezione set default 0;

alter table public.listini_righe_condizioni
  alter column kg_confezione set not null;
