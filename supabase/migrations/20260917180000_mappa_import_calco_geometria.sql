-- Importo da vista: geometria calco (punti/linee/quadrati) senza quadrato limite obbligatorio.
-- ISO 9001: tracciabilità sulla riga asse già esistente (audit + soft delete invariati).

alter table public.magazzino_mappa_riferimenti
  add column if not exists geometria jsonb not null default '[]'::jsonb;

comment on column public.magazzino_mappa_riferimenti.geometria is
  'Calco importato in coordinate normalizzate (0-1) rispetto al rettangolo dest: { haLimite, elementi[] }. Soft-delete e audit restano sulla riga.';

notify pgrst, 'reload schema';
