-- Copia sequenza: traccia della fonte (ISO 9001 §8.5.2 / 7.5).
-- La copia nasce Bozza v1; i passi si duplicano, le esecuzioni no.

SET lock_timeout = '8s';
SET deadlock_timeout = '2s';

ALTER TABLE public.action_sequenze
  ADD COLUMN IF NOT EXISTS copiata_da_id uuid REFERENCES public.action_sequenze (id);

CREATE INDEX IF NOT EXISTS action_seq_copiata_da_idx
  ON public.action_sequenze (copiata_da_id)
  WHERE deleted_at IS NULL AND copiata_da_id IS NOT NULL;

COMMENT ON COLUMN public.action_sequenze.copiata_da_id IS
  'Sequenza da cui è stata copiata questa bozza. Soft: la fonte non si cancella.';
