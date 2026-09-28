-- Suddivisione dello sconto extra fra azienda e commerciale.
-- Le fasce di approvazione già presenti restano. Qui si firma solo la ripartizione.

SET lock_timeout = '8s';

ALTER TABLE public.ordini
  ADD COLUMN IF NOT EXISTS sconto_quota_azienda_pct numeric(6, 2) NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS sconto_quota_commerciale_pct numeric(6, 2) NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS sconto_suddivisione_attiva boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS sconto_suddivisione_stato text NOT NULL DEFAULT 'non_richiesta',
  ADD COLUMN IF NOT EXISTS sconto_suddivisione_approvatore text NOT NULL DEFAULT '';

ALTER TABLE public.preventivi_righe
  ADD COLUMN IF NOT EXISTS sconto_quota_azienda_pct numeric(6, 2) NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS sconto_quota_commerciale_pct numeric(6, 2) NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS sconto_suddivisione_attiva boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS sconto_suddivisione_stato text NOT NULL DEFAULT 'non_richiesta',
  ADD COLUMN IF NOT EXISTS sconto_suddivisione_approvatore text NOT NULL DEFAULT '';

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'ordini_sconto_suddivisione_stato_check'
  ) THEN
    ALTER TABLE public.ordini
      ADD CONSTRAINT ordini_sconto_suddivisione_stato_check
      CHECK (sconto_suddivisione_stato IN ('non_richiesta', 'in_attesa', 'approvata', 'rifiutata'));
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'preventivi_righe_sconto_suddivisione_stato_check'
  ) THEN
    ALTER TABLE public.preventivi_righe
      ADD CONSTRAINT preventivi_righe_sconto_suddivisione_stato_check
      CHECK (sconto_suddivisione_stato IN ('non_richiesta', 'in_attesa', 'approvata', 'rifiutata'));
  END IF;
END $$;

CREATE TABLE IF NOT EXISTS public.sconto_suddivisione_approvazioni (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  entity_type text NOT NULL,
  entity_id uuid NOT NULL,
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
  CONSTRAINT sconto_suddivisione_approvazioni_entity_check
    CHECK (entity_type IN ('ordine', 'preventivo_riga')),
  CONSTRAINT sconto_suddivisione_approvazioni_ruolo_check
    CHECK (ruolo IN ('commerciale_senior', 'azienda')),
  CONSTRAINT sconto_suddivisione_approvazioni_esito_check
    CHECK (esito IN ('approvato', 'rifiutato'))
);

CREATE INDEX IF NOT EXISTS sconto_suddivisione_approvazioni_entity_idx
  ON public.sconto_suddivisione_approvazioni (entity_type, entity_id)
  WHERE deleted_at IS NULL;

ALTER TABLE public.sconto_suddivisione_approvazioni ENABLE ROW LEVEL SECURITY;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public'
      AND tablename = 'sconto_suddivisione_approvazioni'
      AND policyname = 'sconto_suddivisione_approvazioni_select'
  ) THEN
    CREATE POLICY sconto_suddivisione_approvazioni_select
      ON public.sconto_suddivisione_approvazioni
      FOR SELECT TO authenticated
      USING (deleted_at IS NULL);
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public'
      AND tablename = 'sconto_suddivisione_approvazioni'
      AND policyname = 'sconto_suddivisione_approvazioni_insert'
  ) THEN
    CREATE POLICY sconto_suddivisione_approvazioni_insert
      ON public.sconto_suddivisione_approvazioni
      FOR INSERT TO authenticated
      WITH CHECK (true);
  END IF;
END $$;

GRANT SELECT, INSERT ON public.sconto_suddivisione_approvazioni TO authenticated;
