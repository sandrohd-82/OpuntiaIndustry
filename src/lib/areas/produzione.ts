import {
  firstNavLeafPath,
  isNavBranch,
  resolveNavPage,
  type NavItem,
} from "@/lib/areas/nav-tree";

export type { NavBranch, NavLeaf, NavItem as ProduzioneNavItem } from "@/lib/areas/nav-tree";
export { isNavBranch };

/** Sottosezioni del modulo Produzione (menu laterale) */
export const PRODUZIONE_SECTIONS: readonly NavItem[] = [
  {
    slug: "fogli-lavorazione",
    label: "Fogli Lavorazione",
    description: "Fogli di lavorazione (~24h) della produzione",
    path: "/app/produzione/fogli-lavorazione",
  },
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
    slug: "processi",
    label: "Processi",
    description:
      "Processi produttivi e attività di esecuzione (ricette ordinate)",
    path: "/app/produzione/processi",
    children: [
      {
        slug: "elenco",
        label: "Elenco processi",
        description:
          "Processi (es. essiccazione) con composizione ordinata di attività",
        path: "/app/produzione/processi/elenco",
      },
      {
        slug: "attivita",
        label: "Attività di processo",
        description:
          "Catalogo attività riusabili (pesare, scarico, mescolata, …)",
        path: "/app/produzione/processi/attivita",
      },
    ],
  },
  {
    slug: "reparti",
    label: "Reparti",
    description: "Anagrafica reparti produttivi collegabili al magazzino",
    path: "/app/produzione/reparti",
  },
  {
    slug: "statistiche",
    label: "Statistiche",
    description: "Indicatori e report di produzione",
    path: "/app/produzione/statistiche",
  },
] as const;

export function getFirstProduzionePath(): string {
  return firstNavLeafPath(PRODUZIONE_SECTIONS);
}

/** Risolve una pagina foglia da path relativo sotto /app/produzione */
export function resolveProduzionePage(segments: string[]) {
  return resolveNavPage(PRODUZIONE_SECTIONS, segments);
}
