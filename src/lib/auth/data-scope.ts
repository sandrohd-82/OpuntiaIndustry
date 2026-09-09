import { isNavBranch, type NavItem } from "@/lib/areas/nav-tree";
import { AREA_FISCALE_SECTIONS } from "@/lib/areas/area-fiscale";

export const DATA_SCOPE_MODES = [
  "tutte",
  "proprie",
  "da_oggi",
  "aziende_proprie",
] as const;

export type DataScopeMode = (typeof DATA_SCOPE_MODES)[number];

export const AREA_FISCALE_PATH = "/app/area-fiscale";
export const RICERCA_SVILUPPO_PATH = "/app/ricerca-sviluppo";

export const COMMERCIALISTA_EXCLUDED_PATHS = [
  "/app/area-fiscale/banca/disponi-bonifico",
  "/app/area-fiscale/banca/pagamenti-dipendenti",
] as const;

export const COMMERCIALISTA_EXCLUDED_PATH_SET = new Set<string>(
  COMMERCIALISTA_EXCLUDED_PATHS
);

export type ProfileAuthSettings = {
  isCommercialista: boolean;
  fiscaleUnlocked: boolean;
  rsUnlocked: boolean;
};

export type DataScopeMap = Partial<Record<string, DataScopeMode>>;

export const EMPTY_AUTH_SETTINGS: ProfileAuthSettings = {
  isCommercialista: false,
  fiscaleUnlocked: false,
  rsUnlocked: false,
};

export type SensitiveScopeGroup = {
  key: string;
  /** Se presente, più voci stanno nello stesso riquadro. */
  section?: string;
  title: string;
  hint: string;
  required: boolean;
  modes: ReadonlyArray<{ value: DataScopeMode; label: string }>;
};

export const SENSITIVE_SCOPE_GROUPS: readonly SensitiveScopeGroup[] = [
  {
    key: "anagrafiche_clienti",
    title: "Clienti, possibili clienti e rubrica",
    hint: "Obbligatoria. Vale per elenco clienti, possibili clienti e rubrica.",
    required: true,
    modes: [
      { value: "tutte", label: "Tutte" },
      { value: "proprie", label: "Solo quelle da lui inserite" },
    ],
  },
  {
    key: "fornitori",
    title: "Elenco fornitori",
    hint: "Obbligatoria. Vale per l’elenco fornitori.",
    required: true,
    modes: [
      { value: "tutte", label: "Tutte" },
      { value: "proprie", label: "Solo quelli da lui inseriti" },
    ],
  },
  {
    key: "ordini",
    title: "Ordini",
    hint: "Obbligatoria. Vale per gli ordini visibili al profilo.",
    required: true,
    modes: [
      { value: "tutte", label: "Tutti" },
      { value: "proprie", label: "Solo quelli da lui inseriti" },
    ],
  },
  {
    key: "statistiche",
    section: "Statistiche",
    title: "Periodo",
    hint: "Obbligatoria. Storico completo oppure solo da oggi in poi.",
    required: true,
    modes: [
      { value: "tutte", label: "Tutte" },
      { value: "da_oggi", label: "Da oggi in poi" },
    ],
  },
  {
    key: "statistiche_aziende",
    section: "Statistiche",
    title: "Aziende",
    hint: "Obbligatoria. Tutte le aziende oppure solo quelle inserite da lui.",
    required: true,
    modes: [
      { value: "tutte", label: "Tutte" },
      {
        value: "aziende_proprie",
        label: "Solo collegate ad aziende inserite da lui",
      },
    ],
  },
];

export const SENSITIVE_SCOPE_KEY_SET = new Set(
  SENSITIVE_SCOPE_GROUPS.map((g) => g.key)
);

export type FiscaleViewScope = {
  key: string;
  label: string;
  path: string;
  modes: ReadonlyArray<{ value: DataScopeMode; label: string }>;
};

const DOC_MODES: ReadonlyArray<{ value: DataScopeMode; label: string }> = [
  { value: "tutte", label: "Tutte" },
  { value: "da_oggi", label: "Da oggi" },
  {
    value: "aziende_proprie",
    label: "Solo quelle collegate alle aziende da lui caricate",
  },
];

const CALC_MODES: ReadonlyArray<{ value: DataScopeMode; label: string }> = [
  { value: "tutte", label: "Tutte" },
  { value: "da_oggi", label: "Da oggi" },
];

export const FISCALE_VIEW_SCOPES: readonly FiscaleViewScope[] = [
  {
    key: "fiscale.fatture_emesse",
    label: "Fatture emesse",
    path: "/app/area-fiscale/fatture/emesse",
    modes: DOC_MODES,
  },
  {
    key: "fiscale.fatture_ricevute",
    label: "Fatture ricevute",
    path: "/app/area-fiscale/fatture/ricevute",
    modes: DOC_MODES,
  },
  {
    key: "fiscale.note_credito_emesse",
    label: "Note di credito emesse",
    path: "/app/area-fiscale/note-di-credito/emesse",
    modes: DOC_MODES,
  },
  {
    key: "fiscale.note_credito_ricevute",
    label: "Note di credito ricevute",
    path: "/app/area-fiscale/note-di-credito/ricevute",
    modes: DOC_MODES,
  },
  {
    key: "fiscale.ddt_emessi",
    label: "DDT emessi",
    path: "/app/area-fiscale/ddt/emessi",
    modes: DOC_MODES,
  },
  {
    key: "fiscale.ddt_ricevuti",
    label: "DDT ricevuti",
    path: "/app/area-fiscale/ddt/ricevuti",
    modes: DOC_MODES,
  },
  {
    key: "fiscale.contratti",
    label: "Contratti",
    path: "/app/area-fiscale/contratti/elenco",
    modes: DOC_MODES,
  },
  {
    key: "fiscale.iva",
    label: "IVA e imposte",
    path: "/app/area-fiscale/dati-e-calcoli/iva-e-imposte",
    modes: CALC_MODES,
  },
  {
    key: "fiscale.utili",
    label: "Utili",
    path: "/app/area-fiscale/dati-e-calcoli/utili",
    modes: CALC_MODES,
  },
  {
    key: "fiscale.analisi_costi",
    label: "Analisi costi",
    path: "/app/area-fiscale/dati-e-calcoli/analisi-costi",
    modes: CALC_MODES,
  },
  {
    key: "fiscale.movimenti",
    label: "Movimenti banca",
    path: "/app/area-fiscale/banca/movimenti",
    modes: CALC_MODES,
  },
];

export const FISCALE_VIEW_KEY_SET = new Set(
  FISCALE_VIEW_SCOPES.map((row) => row.key)
);

export const ALL_SCOPE_KEY_SET = new Set<string>([
  ...SENSITIVE_SCOPE_KEY_SET,
  ...FISCALE_VIEW_KEY_SET,
]);

export function isLockedAreaKey(path: string): boolean {
  return (
    path === AREA_FISCALE_PATH ||
    path === RICERCA_SVILUPPO_PATH
  );
}

export function isFiscalePath(path: string): boolean {
  return path === AREA_FISCALE_PATH || path.startsWith(`${AREA_FISCALE_PATH}/`);
}

export function isRicercaSviluppoPath(path: string): boolean {
  return (
    path === RICERCA_SVILUPPO_PATH ||
    path.startsWith(`${RICERCA_SVILUPPO_PATH}/`)
  );
}

export function isSensitiveLockedPath(path: string): boolean {
  return isFiscalePath(path) || isRicercaSviluppoPath(path);
}

export function lockedAreaKind(
  path: string
): "fiscale" | "rs" | null {
  if (isFiscalePath(path)) return "fiscale";
  if (isRicercaSviluppoPath(path)) return "rs";
  return null;
}

export function isAreaUnlocked(
  path: string,
  settings: ProfileAuthSettings
): boolean {
  const kind = lockedAreaKind(path);
  if (kind === "fiscale") return settings.fiscaleUnlocked;
  if (kind === "rs") return settings.rsUnlocked;
  return true;
}

export function collectNavPaths(items: readonly NavItem[]): string[] {
  const out: string[] = [];
  for (const item of items) {
    out.push(item.path);
    if (isNavBranch(item)) {
      out.push(...collectNavPaths(item.children));
    }
  }
  return out;
}

export function commercialeFiscaleGrantPaths(): {
  grantOn: string[];
  grantOff: string[];
} {
  const all = collectNavPaths(AREA_FISCALE_SECTIONS);
  const grantOff = all.filter((p) => COMMERCIALISTA_EXCLUDED_PATH_SET.has(p));
  const grantOn = [
    AREA_FISCALE_PATH,
    ...all.filter((p) => !COMMERCIALISTA_EXCLUDED_PATH_SET.has(p)),
  ];
  return { grantOn: [...new Set(grantOn)], grantOff };
}

export function allowedModesForScope(scopeKey: string): DataScopeMode[] {
  const group = SENSITIVE_SCOPE_GROUPS.find((g) => g.key === scopeKey);
  if (group) return group.modes.map((m) => m.value);
  const view = FISCALE_VIEW_SCOPES.find((g) => g.key === scopeKey);
  if (view) return view.modes.map((m) => m.value);
  return [];
}

export function defaultModeForScope(
  scopeKey: string,
  settings: ProfileAuthSettings
): DataScopeMode {
  if (scopeKey === "statistiche") return "da_oggi";
  if (scopeKey === "statistiche_aziende") return "aziende_proprie";
  if (scopeKey.startsWith("fiscale.")) {
    return settings.isCommercialista ? "tutte" : "aziende_proprie";
  }
  return "proprie";
}

export function effectiveScopeMode(
  scopeKey: string,
  scopes: DataScopeMap,
  settings: ProfileAuthSettings
): DataScopeMode {
  const stored = scopes[scopeKey];
  if (stored) return stored;
  return defaultModeForScope(scopeKey, settings);
}

export function todayRomeDate(): string {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "Europe/Rome",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(new Date());
}

/** Overlay operativo: aree blindate restano Off finché non sbloccate. */
export function applySensitiveLocks(
  pageAccess: Record<string, boolean>,
  settings: ProfileAuthSettings
): Record<string, boolean> {
  const map = { ...pageAccess };
  if (!settings.fiscaleUnlocked) {
    map[AREA_FISCALE_PATH] = false;
  }
  if (!settings.rsUnlocked) {
    map[RICERCA_SVILUPPO_PATH] = false;
  }
  if (settings.isCommercialista) {
    for (const path of COMMERCIALISTA_EXCLUDED_PATHS) {
      map[path] = false;
    }
  }
  return map;
}
