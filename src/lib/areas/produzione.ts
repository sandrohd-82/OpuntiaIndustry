export type NavLeaf = {
  slug: string;
  label: string;
  description: string;
  path: string;
};

export type NavBranch = {
  slug: string;
  label: string;
  description: string;
  path: string;
  children: readonly NavLeaf[];
};

export type ProduzioneNavItem = NavLeaf | NavBranch;

export function isNavBranch(item: ProduzioneNavItem): item is NavBranch {
  return "children" in item && Array.isArray(item.children);
}

/** Sottosezioni del modulo Produzione (menu laterale) */
export const PRODUZIONE_SECTIONS: readonly ProduzioneNavItem[] = [
  {
    slug: "essiccatori",
    label: "Essiccatori",
    description: "Gestione e monitoraggio essiccatori",
    path: "/app/produzione/essiccatori",
    children: [
      {
        slug: "gestione",
        label: "Gestione essiccatori",
        description: "Stato e dati di esercizio degli essiccatori",
        path: "/app/produzione/essiccatori/gestione",
      },
      {
        slug: "planimetria-piazzale",
        label: "Planimetria Piazzale",
        description: "Planimetria del piazzale essiccatori",
        path: "/app/produzione/essiccatori/planimetria-piazzale",
      },
      {
        slug: "dati-e-storico",
        label: "Dati e storico",
        description: "Dati e storico degli essiccatori",
        path: "/app/produzione/essiccatori/dati-e-storico",
      },
    ],
  },
  {
    slug: "linea-di-taglio",
    label: "Linea di taglio",
    description: "Linea di taglio e avanzamento",
    path: "/app/produzione/linea-di-taglio",
  },
  {
    slug: "merce-in-ingresso",
    label: "Merce in ingresso",
    description: "Registrazione merce in ingresso",
    path: "/app/produzione/merce-in-ingresso",
  },
  {
    slug: "calendario-produzione",
    label: "Calendario produzione",
    description: "Pianificazione e calendario di produzione",
    path: "/app/produzione/calendario-produzione",
  },
  {
    slug: "turnistica",
    label: "Turnistica",
    description: "Turni e organizzazione del personale produttivo",
    path: "/app/produzione/turnistica",
  },
  {
    slug: "statistiche",
    label: "Statistiche",
    description: "Indicatori e report di produzione",
    path: "/app/produzione/statistiche",
  },
] as const;

export function getFirstProduzionePath(): string {
  const first = PRODUZIONE_SECTIONS[0];
  if (isNavBranch(first)) {
    return first.children[0]?.path ?? first.path;
  }
  return first.path;
}

/** Risolve una pagina foglia da path relativo sotto /app/produzione */
export function resolveProduzionePage(
  segments: string[]
): { label: string; description: string } | null {
  if (segments.length === 0) return null;

  const [first, second] = segments;
  const section = PRODUZIONE_SECTIONS.find((item) => item.slug === first);
  if (!section) return null;

  if (isNavBranch(section)) {
    if (!second) return null;
    const child = section.children.find((item) => item.slug === second);
    if (!child || segments.length > 2) return null;
    return { label: child.label, description: child.description };
  }

  if (segments.length > 1) return null;
  return { label: section.label, description: section.description };
}
