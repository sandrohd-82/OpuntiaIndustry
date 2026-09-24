-- Sequenze Action + Elenco Componenti IoT (ISO 9001 §8.5.2 / 7.5 / 6.1).
-- Sostituisce il modello Avvio/Arresto di 20260924090000 (non applicare quella).
-- Lock-safe: nessun DROP POLICY.

SET lock_timeout = '8s';
SET deadlock_timeout = '2s';

-- ---------------------------------------------------------------------------
-- Componenti IoT (attuatori)
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.action_iot_componenti (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  codice text NOT NULL,
  nome text NOT NULL,
  descrizione text NOT NULL DEFAULT '',
  tipo_attuatore text NOT NULL,
  essiccatore_id text,
  area_slug text NOT NULL DEFAULT 'essiccatori',
  richiede_consenso boolean NOT NULL DEFAULT false,
  valore_min numeric(10, 2) NOT NULL DEFAULT 0,
  valore_max numeric(10, 2) NOT NULL DEFAULT 1,
  valore_default numeric(10, 2) NOT NULL DEFAULT 0,
  unita text NOT NULL DEFAULT '',
  precondizione text NOT NULL DEFAULT 'nessuna',
  mex_cmd integer,
  durata_impulso_default_sec integer,
  impostazioni jsonb NOT NULL DEFAULT '{}'::jsonb,
  versione integer NOT NULL DEFAULT 1,
  documento_stato text NOT NULL DEFAULT 'approvato',
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  created_by uuid REFERENCES auth.users (id) ON DELETE SET NULL,
  updated_by uuid REFERENCES auth.users (id) ON DELETE SET NULL,
  deleted_at timestamptz,
  deleted_by uuid REFERENCES auth.users (id) ON DELETE SET NULL,
  CONSTRAINT action_iot_comp_tipo_check CHECK (
    tipo_attuatore IN (
      'on_off',
      'on_off_temporizzato',
      'inverter',
      'inverter_consenso',
      'setpoint_temperatura'
    )
  ),
  CONSTRAINT action_iot_comp_pre_check CHECK (
    precondizione IN ('nessuna', 'chiuso', 'aperto', 'spento', 'acceso')
  ),
  CONSTRAINT action_iot_comp_doc_check CHECK (
    documento_stato IN ('bozza', 'approvato', 'chiuso')
  ),
  CONSTRAINT action_iot_comp_nome_len CHECK (char_length(trim(nome)) BETWEEN 2 AND 120),
  CONSTRAINT action_iot_comp_codice_len CHECK (char_length(trim(codice)) BETWEEN 2 AND 40)
);

CREATE UNIQUE INDEX IF NOT EXISTS action_iot_comp_codice_uidx
  ON public.action_iot_componenti (lower(codice))
  WHERE deleted_at IS NULL;

CREATE INDEX IF NOT EXISTS action_iot_comp_ess_idx
  ON public.action_iot_componenti (essiccatore_id, nome)
  WHERE deleted_at IS NULL;

COMMENT ON TABLE public.action_iot_componenti IS
  'Catalogo attuatori IoT. La scheda decide On/Off, % inverter o temperatura.';

-- ---------------------------------------------------------------------------
-- Sequenze
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.action_sequenze (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  essiccatore_id text NOT NULL,
  nome text NOT NULL,
  descrizione text NOT NULL DEFAULT '',
  tipo text NOT NULL,
  versione integer NOT NULL DEFAULT 1,
  documento_stato text NOT NULL DEFAULT 'bozza',
  esecuzione_stato text NOT NULL DEFAULT 'ferma',
  esecuzione_id uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  created_by uuid REFERENCES auth.users (id) ON DELETE SET NULL,
  updated_by uuid REFERENCES auth.users (id) ON DELETE SET NULL,
  deleted_at timestamptz,
  deleted_by uuid REFERENCES auth.users (id) ON DELETE SET NULL,
  CONSTRAINT action_seq_ess_check CHECK (
    essiccatore_id IN ('ess-a', 'ess-b', 'ess-ultimo-stadio')
  ),
  CONSTRAINT action_seq_tipo_check CHECK (tipo IN ('azione', 'chiusura', 'sicurezza')),
  CONSTRAINT action_seq_doc_check CHECK (
    documento_stato IN ('bozza', 'approvato', 'chiuso')
  ),
  CONSTRAINT action_seq_esec_check CHECK (esecuzione_stato IN ('ferma', 'in_corso')),
  CONSTRAINT action_seq_nome_len CHECK (char_length(trim(nome)) BETWEEN 2 AND 120)
);

CREATE UNIQUE INDEX IF NOT EXISTS action_seq_in_corso_ess_uidx
  ON public.action_sequenze (essiccatore_id)
  WHERE deleted_at IS NULL AND esecuzione_stato = 'in_corso';

CREATE INDEX IF NOT EXISTS action_seq_ess_idx
  ON public.action_sequenze (essiccatore_id, tipo, nome)
  WHERE deleted_at IS NULL;

COMMENT ON TABLE public.action_sequenze IS
  'Ricetta ordinata di comandi IoT: Azione, Chiusura o Sicurezza.';

CREATE TABLE IF NOT EXISTS public.action_sequenza_passi (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  sequenza_id uuid NOT NULL REFERENCES public.action_sequenze (id) ON DELETE RESTRICT,
  componente_id uuid NOT NULL REFERENCES public.action_iot_componenti (id) ON DELETE RESTRICT,
  sort_order integer NOT NULL DEFAULT 0,
  comando text NOT NULL,
  valore numeric(10, 2),
  durata_comando_sec integer,
  stallo_dopo_sec integer,
  precondizione text NOT NULL DEFAULT 'nessuna',
  versione integer NOT NULL DEFAULT 1,
  documento_stato text NOT NULL DEFAULT 'approvato',
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  created_by uuid REFERENCES auth.users (id) ON DELETE SET NULL,
  updated_by uuid REFERENCES auth.users (id) ON DELETE SET NULL,
  deleted_at timestamptz,
  deleted_by uuid REFERENCES auth.users (id) ON DELETE SET NULL,
  CONSTRAINT action_seq_passo_cmd_check CHECK (comando IN ('on', 'off', 'setpoint')),
  CONSTRAINT action_seq_passo_pre_check CHECK (
    precondizione IN ('nessuna', 'chiuso', 'aperto', 'spento', 'acceso')
  ),
  CONSTRAINT action_seq_passo_doc_check CHECK (
    documento_stato IN ('bozza', 'approvato', 'chiuso')
  )
);

CREATE UNIQUE INDEX IF NOT EXISTS action_seq_passi_ord_uidx
  ON public.action_sequenza_passi (sequenza_id, sort_order)
  WHERE deleted_at IS NULL;

CREATE TABLE IF NOT EXISTS public.action_sequenza_esecuzioni (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  sequenza_id uuid NOT NULL REFERENCES public.action_sequenze (id) ON DELETE RESTRICT,
  essiccatore_id text NOT NULL,
  stato text NOT NULL DEFAULT 'in_corso',
  started_at timestamptz NOT NULL DEFAULT now(),
  ended_at timestamptz,
  esito_note text NOT NULL DEFAULT '',
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  created_by uuid REFERENCES auth.users (id) ON DELETE SET NULL,
  updated_by uuid REFERENCES auth.users (id) ON DELETE SET NULL,
  deleted_at timestamptz,
  deleted_by uuid REFERENCES auth.users (id) ON DELETE SET NULL,
  CONSTRAINT action_seq_esec_stato_check CHECK (
    stato IN ('in_corso', 'ok', 'errore', 'interrotta')
  )
);

CREATE INDEX IF NOT EXISTS action_seq_esec_seq_idx
  ON public.action_sequenza_esecuzioni (sequenza_id, started_at DESC)
  WHERE deleted_at IS NULL;

DO $$
DECLARE
  t text;
BEGIN
  FOREACH t IN ARRAY ARRAY[
    'action_iot_componenti',
    'action_sequenze',
    'action_sequenza_passi',
    'action_sequenza_esecuzioni'
  ]
  LOOP
    IF NOT EXISTS (
      SELECT 1
      FROM pg_trigger tr
      JOIN pg_class c ON c.oid = tr.tgrelid
      JOIN pg_namespace n ON n.oid = c.relnamespace
      WHERE n.nspname = 'public'
        AND c.relname = t
        AND tr.tgname = t || '_updated_at'
        AND NOT tr.tgisinternal
    ) THEN
      EXECUTE format(
        'CREATE TRIGGER %I BEFORE UPDATE ON public.%I FOR EACH ROW EXECUTE FUNCTION public.set_updated_at()',
        t || '_updated_at',
        t
      );
    END IF;

    IF NOT EXISTS (
      SELECT 1 FROM pg_class c
      JOIN pg_namespace n ON n.oid = c.relnamespace
      WHERE n.nspname = 'public' AND c.relname = t AND c.relrowsecurity
    ) THEN
      EXECUTE format('ALTER TABLE public.%I ENABLE ROW LEVEL SECURITY', t);
    END IF;

    IF NOT EXISTS (
      SELECT 1 FROM pg_policies
      WHERE schemaname = 'public' AND tablename = t AND policyname = t || '_all'
    ) THEN
      EXECUTE format(
        $p$
        CREATE POLICY %I ON public.%I FOR ALL TO authenticated
        USING (
          public.has_area_access('action')
          OR public.has_area_access('produzione')
          OR public.is_superadmin()
        )
        WITH CHECK (
          public.has_area_access('action') OR public.is_superadmin()
        )
        $p$,
        t || '_all',
        t
      );
    END IF;

    EXECUTE format(
      'GRANT SELECT, INSERT, UPDATE ON TABLE public.%I TO authenticated',
      t
    );
    EXECUTE format(
      'GRANT ALL ON TABLE public.%I TO postgres, service_role',
      t
    );
    EXECUTE format(
      'REVOKE DELETE ON TABLE public.%I FROM authenticated',
      t
    );
  END LOOP;
END $$;

-- Programmate / processi: puntano anche alle Sequenze (registrata resta per storico).
ALTER TABLE public.action_essiccatore_programmate
  ADD COLUMN IF NOT EXISTS sequenza_id uuid REFERENCES public.action_sequenze (id);

ALTER TABLE public.action_essiccatore_programmate
  ALTER COLUMN registrata_id DROP NOT NULL;

ALTER TABLE public.action_essiccatore_processi_passi
  ADD COLUMN IF NOT EXISTS sequenza_id uuid REFERENCES public.action_sequenze (id);

ALTER TABLE public.action_essiccatore_processi_passi
  ALTER COLUMN registrata_id DROP NOT NULL;

-- Seed componenti essiccatori (idempotente sul codice).
INSERT INTO public.action_iot_componenti (
  codice, nome, descrizione, tipo_attuatore, essiccatore_id, area_slug,
  richiede_consenso, valore_min, valore_max, valore_default, unita,
  precondizione, mex_cmd, durata_impulso_default_sec, documento_stato, versione
)
SELECT v.codice, v.nome, v.descrizione, v.tipo, v.ess, 'essiccatori',
       v.consenso, v.vmin, v.vmax, v.vdef, v.unita, v.pre, v.cmd, v.impulso,
       'approvato', 1
FROM (
  VALUES
    ('BRU-CONS-ESS-A', 'Bruciatore consenso', 'Consenso On/Off bruciatore', 'on_off', 'ess-a', true, 0, 1, 0, '', 'spento', 1, NULL),
    ('BRU-TEMP-ESS-A', 'Bruciatore temperatura', 'Setpoint 35–70 °C', 'setpoint_temperatura', 'ess-a', false, 35, 70, 50, '°C', 'nessuna', 2, NULL),
    ('VENT-CONS-ESS-A', 'Ventola consenso', 'Consenso On/Off ventilazione', 'on_off', 'ess-a', true, 0, 1, 0, '', 'spento', 3, NULL),
    ('VENT-POT-ESS-A', 'Ventola potenza', 'Potenza ventilazione 0–100%', 'inverter', 'ess-a', false, 0, 100, 70, '%', 'nessuna', 4, NULL),
    ('VALV-SCAR-ESS-A', 'Valvola scarico', 'Impulso On temporizzato', 'on_off_temporizzato', 'ess-a', false, 0, 1, 0, '', 'chiuso', NULL, 10),
    ('BRU-CONS-ESS-B', 'Bruciatore consenso', 'Consenso On/Off bruciatore', 'on_off', 'ess-b', true, 0, 1, 0, '', 'spento', 1, NULL),
    ('BRU-TEMP-ESS-B', 'Bruciatore temperatura', 'Setpoint 35–70 °C', 'setpoint_temperatura', 'ess-b', false, 35, 70, 50, '°C', 'nessuna', 2, NULL),
    ('VENT-CONS-ESS-B', 'Ventola consenso', 'Consenso On/Off ventilazione', 'on_off', 'ess-b', true, 0, 1, 0, '', 'spento', 3, NULL),
    ('VENT-POT-ESS-B', 'Ventola potenza', 'Potenza ventilazione 0–100%', 'inverter', 'ess-b', false, 0, 100, 70, '%', 'nessuna', 4, NULL),
    ('VALV-SCAR-ESS-B', 'Valvola scarico', 'Impulso On temporizzato', 'on_off_temporizzato', 'ess-b', false, 0, 1, 0, '', 'chiuso', NULL, 10),
    ('BRU-CONS-ESS-U', 'Bruciatore consenso', 'Consenso On/Off bruciatore', 'on_off', 'ess-ultimo-stadio', true, 0, 1, 0, '', 'spento', 1, NULL),
    ('BRU-TEMP-ESS-U', 'Bruciatore temperatura', 'Setpoint 35–70 °C', 'setpoint_temperatura', 'ess-ultimo-stadio', false, 35, 70, 50, '°C', 'nessuna', 2, NULL),
    ('VENT-CONS-ESS-U', 'Ventola consenso', 'Consenso On/Off ventilazione', 'on_off', 'ess-ultimo-stadio', true, 0, 1, 0, '', 'spento', 3, NULL),
    ('VENT-POT-ESS-U', 'Ventola potenza', 'Potenza ventilazione 0–100%', 'inverter', 'ess-ultimo-stadio', false, 0, 100, 70, '%', 'nessuna', 4, NULL),
    ('VALV-SCAR-ESS-U', 'Valvola scarico', 'Impulso On temporizzato', 'on_off_temporizzato', 'ess-ultimo-stadio', false, 0, 1, 0, '', 'chiuso', NULL, 10)
) AS v(codice, nome, descrizione, tipo, ess, consenso, vmin, vmax, vdef, unita, pre, cmd, impulso)
WHERE NOT EXISTS (
  SELECT 1 FROM public.action_iot_componenti c
  WHERE lower(c.codice) = lower(v.codice) AND c.deleted_at IS NULL
);
