-- ISO 9001: sconto extra fuori listino + registro approvazioni immutabile (soft delete).
-- Lock-safe: nessun DROP POLICY. Fasce chiuse; stato ordine invariato.

SET lock_timeout = '8s';

ALTER TABLE public.ordini
  ADD COLUMN IF NOT EXISTS sconto_extra_pct numeric(6, 2) NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS sconto_fascia text NOT NULL DEFAULT 'nessuno',
  ADD COLUMN IF NOT EXISTS sconto_approvazione_stato text NOT NULL DEFAULT 'non_richiesta',
  ADD COLUMN IF NOT EXISTS prezzo_listino_unitario numeric(12, 4);

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'ordini_sconto_fascia_check'
  ) THEN
    ALTER TABLE public.ordini
      ADD CONSTRAINT ordini_sconto_fascia_check
      CHECK (sconto_fascia IN ('nessuno', 'fino_10', 'da_10_a_20', 'da_20_a_30', 'oltre_30'));
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'ordini_sconto_approvazione_stato_check'
  ) THEN
    ALTER TABLE public.ordini
      ADD CONSTRAINT ordini_sconto_approvazione_stato_check
      CHECK (sconto_approvazione_stato IN ('non_richiesta', 'in_attesa', 'approvata', 'rifiutata'));
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'ordini_sconto_extra_pct_check'
  ) THEN
    ALTER TABLE public.ordini
      ADD CONSTRAINT ordini_sconto_extra_pct_check
      CHECK (sconto_extra_pct >= 0 AND sconto_extra_pct <= 100);
  END IF;
END $$;

CREATE TABLE IF NOT EXISTS public.ordine_sconto_approvazioni (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  ordine_id uuid NOT NULL REFERENCES public.ordini (id) ON DELETE RESTRICT,
  ruolo text NOT NULL,
  esito text NOT NULL DEFAULT 'approvato',
  note text,
  decided_at timestamptz NOT NULL DEFAULT now(),
  decided_by uuid REFERENCES auth.users (id),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  created_by uuid REFERENCES auth.users (id),
  updated_by uuid REFERENCES auth.users (id),
  deleted_at timestamptz,
  deleted_by uuid REFERENCES auth.users (id),
  CONSTRAINT ordine_sconto_approvazioni_ruolo_check
    CHECK (ruolo IN ('commerciale_senior', 'superadmin')),
  CONSTRAINT ordine_sconto_approvazioni_esito_check
    CHECK (esito IN ('approvato', 'rifiutato'))
);

CREATE UNIQUE INDEX IF NOT EXISTS ordine_sconto_approvazioni_active_uidx
  ON public.ordine_sconto_approvazioni (ordine_id, ruolo, decided_by)
  WHERE deleted_at IS NULL;

CREATE INDEX IF NOT EXISTS ordine_sconto_approvazioni_ordine_idx
  ON public.ordine_sconto_approvazioni (ordine_id)
  WHERE deleted_at IS NULL;

CREATE INDEX IF NOT EXISTS ordini_sconto_attesa_idx
  ON public.ordini (sconto_approvazione_stato)
  WHERE deleted_at IS NULL AND sconto_approvazione_stato = 'in_attesa';

ALTER TABLE public.ordine_sconto_approvazioni ENABLE ROW LEVEL SECURITY;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public'
      AND tablename = 'ordine_sconto_approvazioni'
      AND policyname = 'ordine_sconto_approvazioni_select'
  ) THEN
    CREATE POLICY ordine_sconto_approvazioni_select
      ON public.ordine_sconto_approvazioni
      FOR SELECT TO authenticated
      USING (deleted_at IS NULL);
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public'
      AND tablename = 'ordine_sconto_approvazioni'
      AND policyname = 'ordine_sconto_approvazioni_insert'
  ) THEN
    CREATE POLICY ordine_sconto_approvazioni_insert
      ON public.ordine_sconto_approvazioni
      FOR INSERT TO authenticated
      WITH CHECK (true);
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public'
      AND tablename = 'ordine_sconto_approvazioni'
      AND policyname = 'ordine_sconto_approvazioni_update'
  ) THEN
    CREATE POLICY ordine_sconto_approvazioni_update
      ON public.ordine_sconto_approvazioni
      FOR UPDATE TO authenticated
      USING (deleted_at IS NULL)
      WITH CHECK (true);
  END IF;
END $$;

GRANT SELECT, INSERT, UPDATE ON public.ordine_sconto_approvazioni TO authenticated;
