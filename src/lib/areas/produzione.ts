import {
  firstNavLeafPath,
  isNavBranch,
  resolveNavPage,
  type NavItem,
} from "@/lib/areas/nav-tree";

export type { NavBranch, NavLeaf, NavItem as ProduzioneNavItem } from "@/lib/areas/nav-tree";
export { isNavBranch };

/** Menu Produzione — struttura target */
export const PRODUZIONE_SECTIONS: readonly NavItem[] = [
  {
    slug: "fogli-lavorazione",
    label: "Fogli di lavorazione",
    description: "Nuovi fogli, esecuzione e storico",
    path: "/app/produzione/fogli-lavorazione",
    children: [
      {
        slug: "nuovo",
        label: "Nuovo Foglio",
        description: "Creazione foglio di lavorazione giornaliero",
        path: "/app/produzione/fogli-lavorazione/nuovo",
      },
      {
        slug: "in-esecuzione",
        label: "Foglio in esecuzione",
        description:
          "Interazione con il foglio della lavorazione giornaliera",
        path: "/app/produzione/fogli-lavorazione/in-esecuzione",
        badge: { kind: "status", active: false },
      },
      {
        slug: "storico",
        label: "Storico Fogli",
        description: "Storico dei fogli di lavorazione",
        path: "/app/produzione/fogli-lavorazione/storico",
      },
    ],
  },
  {
    slug: "processi-e-attivita",
    label: "Processi e attività",
    description: "Processi produttivi e attività di esecuzione",
    path: "/app/produzione/processi-e-attivita",
    children: [
      {
        slug: "nuovo-processo",
        label: "+ Nuovo processo",
        description: "Creazione di un nuovo processo (insieme di attività)",
        path: "/app/produzione/processi-e-attivita/nuovo-processo",
      },
      {
        slug: "elenco-processi",
        label: "Elenco Processi",
        description: "Elenco dei processi creati",
        path: "/app/produzione/processi-e-attivita/elenco-processi",
      },
      {
        slug: "nuova-attivita",
        label: "+ Nuova Attività",
        description: "Creazione di una nuova attività di processo",
        path: "/app/produzione/processi-e-attivita/nuova-attivita",
      },
      {
        slug: "elenco-attivita",
        label: "Elenco Attività",
        description: "Elenco delle attività di processo create",
        path: "/app/produzione/processi-e-attivita/elenco-attivita",
      },
    ],
  },
  {
    slug: "gestione-aree",
    label: "Gestione Aree",
    description: "Stato aree produttive e videosorveglianza",
    path: "/app/produzione/gestione-aree",
    children: [
      {
        slug: "lavaggio",
        label: "Lavaggio",
        description: "Stato area lavaggio e videosorveglianza",
        path: "/app/produzione/gestione-aree/lavaggio",
        badge: { kind: "status", active: false },
      },
      {
        slug: "taglio",
        label: "Taglio",
        description: "Stato area taglio e videosorveglianza",
        path: "/app/produzione/gestione-aree/taglio",
        badge: { kind: "status", active: false },
      },
      {
        slug: "essiccatori",
        label: "Essiccatori",
        description: "Stato area essiccazione e videosorveglianza",
        path: "/app/produzione/gestione-aree/essiccatori",
        badge: { kind: "status", active: false },
      },
      {
        slug: "triturazione",
        label: "Triturazione",
        description: "Stato area triturazione e videosorveglianza",
        path: "/app/produzione/gestione-aree/triturazione",
        badge: { kind: "status", active: false },
      },
    ],
  },
  {
    slug: "calendario",
    label: "Calendario",
    description: "Turni e ruoli per area produttiva",
    path: "/app/produzione/calendario",
    children: [
      {
        slug: "turnistica",
        label: "Turnistica",
        description: "Calendario turni degli operai",
        path: "/app/produzione/calendario/turnistica",
      },
      {
        slug: "area-di-taglio",
        label: "Area di taglio",
        description: "Calendario ruoli area di taglio",
        path: "/app/produzione/calendario/area-di-taglio",
      },
      {
        slug: "essiccazioni",
        label: "Essiccazioni",
        description: "Calendario ruoli area essiccazione",
        path: "/app/produzione/calendario/essiccazioni",
      },
      {
        slug: "triturazioni",
        label: "Triturazioni",
        description: "Calendario ruoli area triturazione",
        path: "/app/produzione/calendario/triturazioni",
      },
      {
        slug: "estrazione",
        label: "Estrazione",
        description: "Calendario ruoli area estrazione gel",
        path: "/app/produzione/calendario/estrazione",
      },
    ],
  },
] as const;

export function getFirstProduzionePath(): string {
  return firstNavLeafPath(PRODUZIONE_SECTIONS);
}

export function resolveProduzionePage(segments: string[]) {
  return resolveNavPage(PRODUZIONE_SECTIONS, segments);
}
