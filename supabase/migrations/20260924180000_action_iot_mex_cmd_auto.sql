-- Mex CMD automatico se manca (ISO 9001 §8.5.2 / 6.1).
-- Primo libero 1–255 nello stesso ambito (macchina, altrimenti essiccatore).

SET lock_timeout = '8s';
SET deadlock_timeout = '2s';

CREATE OR REPLACE FUNCTION public.action_iot_prossimo_mex_cmd(
  p_macchina_id uuid,
  p_essiccatore_id text,
  p_exclude_id uuid
)
RETURNS integer
LANGUAGE plpgsql
STABLE
AS $$
DECLARE
  next_cmd integer;
BEGIN
  SELECT MIN(g.n)
  INTO next_cmd
  FROM generate_series(1, 255) AS g(n)
  WHERE NOT EXISTS (
    SELECT 1
    FROM public.action_iot_componenti c
    WHERE c.deleted_at IS NULL
      AND c.mex_cmd = g.n
      AND c.id IS DISTINCT FROM p_exclude_id
      AND (
        (p_macchina_id IS NOT NULL AND c.macchina_id = p_macchina_id)
        OR (
          p_macchina_id IS NULL
          AND p_essiccatore_id IS NOT NULL
          AND c.macchina_id IS NULL
          AND c.essiccatore_id = p_essiccatore_id
        )
        OR (
          p_macchina_id IS NULL
          AND p_essiccatore_id IS NULL
          AND c.macchina_id IS NULL
          AND c.essiccatore_id IS NULL
        )
      )
  );
  RETURN next_cmd;
END;
$$;

CREATE OR REPLACE FUNCTION public.action_iot_alloca_mex_cmd()
RETURNS trigger
LANGUAGE plpgsql
AS $$
DECLARE
  next_cmd integer;
BEGIN
  IF NEW.deleted_at IS NOT NULL THEN
    RETURN NEW;
  END IF;
  IF NEW.mex_cmd IS NOT NULL THEN
    RETURN NEW;
  END IF;
  next_cmd := public.action_iot_prossimo_mex_cmd(
    NEW.macchina_id,
    NEW.essiccatore_id,
    NEW.id
  );
  IF next_cmd IS NULL THEN
    RAISE EXCEPTION 'Nessun Mex CMD libero (1–255) su questa macchina';
  END IF;
  NEW.mex_cmd := next_cmd;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS action_iot_componenti_alloca_mex_cmd
  ON public.action_iot_componenti;
CREATE TRIGGER action_iot_componenti_alloca_mex_cmd
  BEFORE INSERT OR UPDATE OF mex_cmd, macchina_id, essiccatore_id, deleted_at
  ON public.action_iot_componenti
  FOR EACH ROW
  EXECUTE FUNCTION public.action_iot_alloca_mex_cmd();

DO $$
DECLARE
  r record;
  next_cmd integer;
BEGIN
  FOR r IN
    SELECT id, macchina_id, essiccatore_id
    FROM public.action_iot_componenti
    WHERE deleted_at IS NULL
      AND mex_cmd IS NULL
    ORDER BY created_at, codice
  LOOP
    next_cmd := public.action_iot_prossimo_mex_cmd(
      r.macchina_id,
      r.essiccatore_id,
      r.id
    );
    IF next_cmd IS NULL THEN
      RAISE EXCEPTION 'Nessun Mex CMD libero per canale %', r.id;
    END IF;
    UPDATE public.action_iot_componenti
    SET mex_cmd = next_cmd,
        updated_at = now()
    WHERE id = r.id;
  END LOOP;
END $$;

COMMENT ON FUNCTION public.action_iot_alloca_mex_cmd() IS
  'Se mex_cmd è NULL su canale attivo, assegna il primo libero 1–255 nell’ambito macchina.';
