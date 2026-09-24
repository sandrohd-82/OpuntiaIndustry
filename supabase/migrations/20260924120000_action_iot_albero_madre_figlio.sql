-- Elenco Componenti IoT: albero madre-figlio (ISO 9001 §8.5.2 / 7.5 / 6.1).
-- Macchina → Componente (modulo) → Canale (attuatore|regolatore|sensore)
-- + sensori di macchina + collegamento sensore → azione componente.
-- Lock-safe: nessun DROP POLICY. Soft delete. Nessun delete fisico.

SET lock_timeout = '8s';
SET deadlock_timeout = '2s';

-- ---------------------------------------------------------------------------
-- Macchine
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.action_iot_macchine (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  codice text NOT NULL,
  nome text NOT NULL,
  descrizione text NOT NULL DEFAULT '',
  tipo_macchina text NOT NULL DEFAULT 'essiccatore',
  essiccatore_id text,
  versione integer NOT NULL DEFAULT 1,
  documento_stato text NOT NULL DEFAULT 'approvato',
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  created_by uuid REFERENCES auth.users (id) ON DELETE SET NULL,
  updated_by uuid REFERENCES auth.users (id) ON DELETE SET NULL,
  deleted_at timestamptz,
  deleted_by uuid REFERENCES auth.users (id) ON DELETE SET NULL,
  CONSTRAINT action_iot_mac_tipo_check CHECK (tipo_macchina IN ('essiccatore', 'altra')),
  CONSTRAINT action_iot_mac_ess_check CHECK (
    essiccatore_id IS NULL
    OR essiccatore_id IN ('ess-a', 'ess-b', 'ess-ultimo-stadio')
  ),
  CONSTRAINT action_iot_mac_doc_check CHECK (
    documento_stato IN ('bozza', 'approvato', 'chiuso')
  ),
  CONSTRAINT action_iot_mac_nome_len CHECK (char_length(trim(nome)) BETWEEN 2 AND 120),
  CONSTRAINT action_iot_mac_codice_len CHECK (char_length(trim(codice)) BETWEEN 2 AND 40)
);

CREATE UNIQUE INDEX IF NOT EXISTS action_iot_mac_codice_uidx
  ON public.action_iot_macchine (lower(codice))
  WHERE deleted_at IS NULL;

CREATE UNIQUE INDEX IF NOT EXISTS action_iot_mac_ess_uidx
  ON public.action_iot_macchine (essiccatore_id)
  WHERE deleted_at IS NULL AND essiccatore_id IS NOT NULL;

COMMENT ON TABLE public.action_iot_macchine IS
  'Catalogo macchine IoT (madre). essiccatore_id collega gli impianti Action esistenti.';

-- ---------------------------------------------------------------------------
-- Componenti (moduli) della macchina
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.action_iot_moduli (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  macchina_id uuid NOT NULL REFERENCES public.action_iot_macchine (id) ON DELETE RESTRICT,
  codice text NOT NULL,
  nome text NOT NULL,
  descrizione text NOT NULL DEFAULT '',
  sort_order integer NOT NULL DEFAULT 0,
  versione integer NOT NULL DEFAULT 1,
  documento_stato text NOT NULL DEFAULT 'approvato',
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  created_by uuid REFERENCES auth.users (id) ON DELETE SET NULL,
  updated_by uuid REFERENCES auth.users (id) ON DELETE SET NULL,
  deleted_at timestamptz,
  deleted_by uuid REFERENCES auth.users (id) ON DELETE SET NULL,
  CONSTRAINT action_iot_mod_doc_check CHECK (
    documento_stato IN ('bozza', 'approvato', 'chiuso')
  ),
  CONSTRAINT action_iot_mod_nome_len CHECK (char_length(trim(nome)) BETWEEN 2 AND 120),
  CONSTRAINT action_iot_mod_codice_len CHECK (char_length(trim(codice)) BETWEEN 2 AND 40)
);

CREATE UNIQUE INDEX IF NOT EXISTS action_iot_mod_codice_uidx
  ON public.action_iot_moduli (macchina_id, lower(codice))
  WHERE deleted_at IS NULL;

CREATE INDEX IF NOT EXISTS action_iot_mod_mac_idx
  ON public.action_iot_moduli (macchina_id, sort_order, nome)
  WHERE deleted_at IS NULL;

COMMENT ON TABLE public.action_iot_moduli IS
  'Componenti fisici della macchina (Bruciatore, Ventola, Valvola).';

-- ---------------------------------------------------------------------------
-- Canali: colonne madre-figlio su action_iot_componenti (già esistente)
-- ---------------------------------------------------------------------------
ALTER TABLE public.action_iot_componenti
  ADD COLUMN IF NOT EXISTS macchina_id uuid;

ALTER TABLE public.action_iot_componenti
  ADD COLUMN IF NOT EXISTS modulo_id uuid;

ALTER TABLE public.action_iot_componenti
  ADD COLUMN IF NOT EXISTS ruolo text NOT NULL DEFAULT 'attuatore';

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'action_iot_comp_macchina_fk'
  ) THEN
    ALTER TABLE public.action_iot_componenti
      ADD CONSTRAINT action_iot_comp_macchina_fk
      FOREIGN KEY (macchina_id) REFERENCES public.action_iot_macchine (id)
      ON DELETE RESTRICT;
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'action_iot_comp_modulo_fk'
  ) THEN
    ALTER TABLE public.action_iot_componenti
      ADD CONSTRAINT action_iot_comp_modulo_fk
      FOREIGN KEY (modulo_id) REFERENCES public.action_iot_moduli (id)
      ON DELETE RESTRICT;
  END IF;
END $$;

ALTER TABLE public.action_iot_componenti
  DROP CONSTRAINT IF EXISTS action_iot_comp_ruolo_check;

ALTER TABLE public.action_iot_componenti
  ADD CONSTRAINT action_iot_comp_ruolo_check CHECK (
    ruolo IN ('attuatore', 'regolatore', 'sensore')
  );

CREATE INDEX IF NOT EXISTS action_iot_comp_albero_idx
  ON public.action_iot_componenti (macchina_id, modulo_id, ruolo, nome)
  WHERE deleted_at IS NULL;

-- ---------------------------------------------------------------------------
-- Seed macchine + moduli (idempotente)
-- ---------------------------------------------------------------------------
INSERT INTO public.action_iot_macchine (
  codice, nome, descrizione, tipo_macchina, essiccatore_id, documento_stato, versione
)
SELECT v.codice, v.nome, v.descrizione, 'essiccatore', v.ess, 'approvato', 1
FROM (
  VALUES
    ('ESS-A', 'Essiccatore A', 'Impianto essiccazione fresco 2300 kg', 'ess-a'),
    ('ESS-B', 'Essiccatore B', 'Impianto essiccazione fresco 2300 kg', 'ess-b'),
    ('ESS-US', 'Essiccatore Ultimo Stadio', 'Semisecco, 3 cestoni da 500 kg', 'ess-ultimo-stadio')
) AS v(codice, nome, descrizione, ess)
WHERE NOT EXISTS (
  SELECT 1 FROM public.action_iot_macchine m
  WHERE lower(m.codice) = lower(v.codice) AND m.deleted_at IS NULL
);

INSERT INTO public.action_iot_moduli (
  macchina_id, codice, nome, descrizione, sort_order, documento_stato, versione
)
SELECT m.id, v.codice, v.nome, v.descrizione, v.sort, 'approvato', 1
FROM public.action_iot_macchine m
JOIN (
  VALUES
    ('BRU', 'Bruciatore', 'Gruppo bruciatore: consenso, temperatura, sonda', 1),
    ('VENT', 'Ventola', 'Gruppo ventilazione: consenso e potenza', 2),
    ('VALV', 'Valvola scarico', 'Valvola scarico / gas: impulso', 3)
) AS v(codice, nome, descrizione, sort) ON TRUE
WHERE m.deleted_at IS NULL
  AND NOT EXISTS (
    SELECT 1 FROM public.action_iot_moduli mo
    WHERE mo.macchina_id = m.id
      AND lower(mo.codice) = lower(v.codice)
      AND mo.deleted_at IS NULL
  );

-- Remap 15 canali esistenti sotto macchina + componente.
UPDATE public.action_iot_componenti c
SET
  macchina_id = m.id,
  modulo_id = mo.id,
  ruolo = CASE
    WHEN c.codice ILIKE 'BRU-TEMP-%' OR c.codice ILIKE 'VENT-POT-%' THEN 'regolatore'
    ELSE 'attuatore'
  END,
  updated_at = now()
FROM public.action_iot_macchine m
JOIN public.action_iot_moduli mo
  ON mo.macchina_id = m.id AND mo.deleted_at IS NULL
WHERE c.deleted_at IS NULL
  AND m.deleted_at IS NULL
  AND c.essiccatore_id IS NOT NULL
  AND c.essiccatore_id = m.essiccatore_id
  AND (
    (c.codice ILIKE 'BRU-%' AND mo.codice = 'BRU')
    OR (c.codice ILIKE 'VENT-%' AND mo.codice = 'VENT')
    OR (c.codice ILIKE 'VALV-%' AND mo.codice = 'VALV')
  );

-- Sensori: tipo_attuatore nullable + check combinato.
ALTER TABLE public.action_iot_componenti
  DROP CONSTRAINT IF EXISTS action_iot_comp_tipo_check;

ALTER TABLE public.action_iot_componenti
  ALTER COLUMN tipo_attuatore DROP NOT NULL;

ALTER TABLE public.action_iot_componenti
  DROP CONSTRAINT IF EXISTS action_iot_comp_tipo_ruolo_check;

ALTER TABLE public.action_iot_componenti
  ADD CONSTRAINT action_iot_comp_tipo_ruolo_check CHECK (
    (
      ruolo IN ('attuatore', 'regolatore')
      AND tipo_attuatore IN (
        'on_off',
        'on_off_temporizzato',
        'inverter',
        'inverter_consenso',
        'setpoint_temperatura'
      )
    )
    OR (
      ruolo = 'sensore'
      AND tipo_attuatore IS NULL
    )
  );

-- Sensori di componente (TEMP-BRUC sotto Bruciatore) e di macchina.
INSERT INTO public.action_iot_componenti (
  codice, nome, descrizione, tipo_attuatore, ruolo, macchina_id, modulo_id,
  essiccatore_id, area_slug, richiede_consenso, valore_min, valore_max,
  valore_default, unita, precondizione, mex_cmd, documento_stato, versione
)
SELECT
  s.codice,
  v.nome,
  v.descrizione,
  NULL,
  'sensore',
  m.id,
  CASE WHEN v.mod_codice IS NULL THEN NULL ELSE mo.id END,
  m.essiccatore_id,
  'essiccatori',
  false,
  0,
  0,
  0,
  v.unita,
  'nessuna',
  16,
  'approvato',
  1
FROM public.action_iot_macchine m
JOIN (
  VALUES
    ('TEMP-AMB', 'Temperatura Ambientale', 'Sonda ambiente macchina', '°C', NULL::text),
    ('UMID-AMB', 'Umidità Ambientale', 'Sonda umidità ambiente', '%', NULL),
    ('PRESS-SOFF', 'Pressione piano soffiante', 'Pressione piano soffiante', 'Bar', NULL),
    ('PESO', 'Peso prodotto', 'Peso carico', 'Kg', NULL),
    ('TEMP-BRUC', 'Temperatura uscita bruciatore', 'Sonda sul bruciatore', '°C', 'BRU')
) AS v(prefisso, nome, descrizione, unita, mod_codice)
  ON TRUE
LEFT JOIN public.action_iot_moduli mo
  ON mo.macchina_id = m.id
 AND mo.codice = v.mod_codice
 AND mo.deleted_at IS NULL
CROSS JOIN LATERAL (
  SELECT
    v.prefisso || '-' || CASE m.essiccatore_id
      WHEN 'ess-a' THEN 'ESS-A'
      WHEN 'ess-b' THEN 'ESS-B'
      WHEN 'ess-ultimo-stadio' THEN 'ESS-U'
      ELSE m.codice
    END AS codice
) s
WHERE m.deleted_at IS NULL
  AND NOT EXISTS (
    SELECT 1 FROM public.action_iot_componenti c
    WHERE lower(c.codice) = lower(s.codice) AND c.deleted_at IS NULL
  );

-- ---------------------------------------------------------------------------
-- Collegamento sensore → azione (canale attuatore/regolatore)
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.action_iot_sensore_collegamenti (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  sensore_id uuid NOT NULL REFERENCES public.action_iot_componenti (id) ON DELETE RESTRICT,
  canale_id uuid NOT NULL REFERENCES public.action_iot_componenti (id) ON DELETE RESTRICT,
  ruolo_link text NOT NULL DEFAULT 'feedback',
  note text NOT NULL DEFAULT '',
  versione integer NOT NULL DEFAULT 1,
  documento_stato text NOT NULL DEFAULT 'approvato',
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  created_by uuid REFERENCES auth.users (id) ON DELETE SET NULL,
  updated_by uuid REFERENCES auth.users (id) ON DELETE SET NULL,
  deleted_at timestamptz,
  deleted_by uuid REFERENCES auth.users (id) ON DELETE SET NULL,
  CONSTRAINT action_iot_sens_col_ruolo_check CHECK (
    ruolo_link IN ('feedback', 'precondizione', 'allarme')
  ),
  CONSTRAINT action_iot_sens_col_doc_check CHECK (
    documento_stato IN ('bozza', 'approvato', 'chiuso')
  ),
  CONSTRAINT action_iot_sens_col_diff_check CHECK (sensore_id <> canale_id)
);

CREATE UNIQUE INDEX IF NOT EXISTS action_iot_sens_col_uidx
  ON public.action_iot_sensore_collegamenti (sensore_id, canale_id, ruolo_link)
  WHERE deleted_at IS NULL;

CREATE INDEX IF NOT EXISTS action_iot_sens_col_can_idx
  ON public.action_iot_sensore_collegamenti (canale_id)
  WHERE deleted_at IS NULL;

COMMENT ON TABLE public.action_iot_sensore_collegamenti IS
  'Sensore (macchina o componente) collegato a un attuatore/regolatore.';

INSERT INTO public.action_iot_sensore_collegamenti (
  sensore_id, canale_id, ruolo_link, note, documento_stato, versione
)
SELECT s.id, c.id, 'feedback', v.note, 'approvato', 1
FROM (
  VALUES
    ('TEMP-BRUC-ESS-A', 'BRU-TEMP-ESS-A', 'Feedback temperatura bruciatore'),
    ('TEMP-BRUC-ESS-B', 'BRU-TEMP-ESS-B', 'Feedback temperatura bruciatore'),
    ('TEMP-BRUC-ESS-U', 'BRU-TEMP-ESS-U', 'Feedback temperatura bruciatore'),
    ('PRESS-SOFF-ESS-A', 'VENT-POT-ESS-A', 'Feedback pressione su potenza ventola'),
    ('PRESS-SOFF-ESS-B', 'VENT-POT-ESS-B', 'Feedback pressione su potenza ventola'),
    ('PRESS-SOFF-ESS-U', 'VENT-POT-ESS-U', 'Feedback pressione su potenza ventola')
) AS v(sens_cod, can_cod, note)
JOIN public.action_iot_componenti s
  ON lower(s.codice) = lower(v.sens_cod) AND s.deleted_at IS NULL
JOIN public.action_iot_componenti c
  ON lower(c.codice) = lower(v.can_cod) AND c.deleted_at IS NULL
WHERE NOT EXISTS (
  SELECT 1 FROM public.action_iot_sensore_collegamenti l
  WHERE l.sensore_id = s.id
    AND l.canale_id = c.id
    AND l.ruolo_link = 'feedback'
    AND l.deleted_at IS NULL
);

-- ---------------------------------------------------------------------------
-- Trigger, RLS, GRANT
-- ---------------------------------------------------------------------------
DO $$
DECLARE
  t text;
BEGIN
  FOREACH t IN ARRAY ARRAY[
    'action_iot_macchine',
    'action_iot_moduli',
    'action_iot_sensore_collegamenti'
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
