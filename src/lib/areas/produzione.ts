import {
  firstNavLeafPath,
  isNavBranch,
  resolveNavPage,
  type NavItem,
} from "@/lib/areas/nav-tree";
import type { ProduzioneArea } from "@/lib/produzione/aree-posti";
import { nestMacchinari, type ProduzioneMacchinario } from "@/lib/produzione/macchinari";

export type { NavBranch, NavLeaf, NavItem as ProduzioneNavItem } from "@/lib/areas/nav-tree";
export { isNavBranch };

/** Sidebar: ricarica il menu aree/posti dopo CRUD catalogo. */
export const PRODUZIONE_AREE_NAV_EVENT = "opuntia-aree-updated";

export const GESTIONE_AREE_ELENCO_NAV = {
  slug: "elenco",
  label: "Elenco",
  description: "Elenco delle aree e creazione di nuove aree.",
  path: "/app/produzione/gestione-aree/elenco",
} as const;

/** Menu Produzione — struttura target */
export const PRODUZIONE_SECTIONS: readonly NavItem[] = [
  {
    slug: "foglio-ingresso-mp",
    label: "Foglio Ingresso MP",
    description: "Registrazione carichi materia prima e codice lotto interno",
    path: "/app/produzione/foglio-ingresso-mp",
    children: [
      {
        slug: "nuovo",
        label: "Nuovo",
        description: "Compila il foglio di ingresso materia prima",
        path: "/app/produzione/foglio-ingresso-mp/nuovo",
      },
      {
        slug: "aperti",
        label: "Aperti",
        description: "Bozze e fogli registrati ancora aperti",
        path: "/app/produzione/foglio-ingresso-mp/aperti",
      },
      {
        slug: "storico",
        label: "Storico",
        description: "Fogli ingresso MP chiusi",
        path: "/app/produzione/foglio-ingresso-mp/storico",
      },
    ],
  },
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
    ],
  },
  {
    slug: "ordini",
    label: "Ordini",
    description: "Processazione ordini e inserimento in scaletta",
    path: "/app/produzione/ordini",
    children: [
      {
        slug: "scaletta",
        label: "Metti in scaletta",
        description:
          "Processa gli ordini in attesa e inseriscili in scaletta produzione",
        path: "/app/produzione/ordini/scaletta",
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
        slug: "elenco-processi",
        label: "Elenco Processi",
        description: "Processi attualmente utilizzati",
        path: "/app/produzione/processi-e-attivita/elenco-processi",
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
      GESTIONE_AREE_ELENCO_NAV,
      areaNavBranch(
        "lavaggio",
        "Lavaggio",
        "Versamento e bilancio di massa verso essiccazione."
      ),
      areaNavBranch(
        "taglio",
        "Taglio",
        "Più posti lavoro, stesso obiettivo di lotto."
      ),
      areaNavBranch(
        "essiccatori",
        "Essiccatori",
        "Essiccazione del prodotto pesato."
      ),
      areaNavBranch(
        "triturazione",
        "Triturazione",
        "Triturazione e riduzione volumetrica."
      ),
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

function areaNavBranch(
  slug: string,
  label: string,
  description: string,
  posti: Array<{ slug: string; label: string; description: string }> = [],
  macchine: Array<{
    slug: string;
    label: string;
    description: string;
    children?: Array<{ slug: string; label: string; description: string }>;
  }> = []
): NavItem {
  const base = `/app/produzione/gestione-aree/${slug}`;
  const vasca = macchine.find((m) => m.slug === "vasca-lavaggio");
  const altreMacchine = vasca
    ? macchine.filter((m) => m.slug !== "vasca-lavaggio")
    : macchine;
  const vascaFigliNav: NavItem[] = (vasca?.children ?? []).map((c) => ({
    slug: c.slug,
    label: c.label,
    description: c.description,
    path: `${base}/macchinari/${c.slug}`,
  }));

  function macchinaNavItem(m: (typeof macchine)[number]): NavItem {
    const path = `${base}/macchinari/${m.slug}`;
    if (m.children?.length) {
      return {
        slug: m.slug,
        label: m.label,
        description: m.description,
        path,
        children: [
          {
            slug: m.slug,
            label: m.label,
            description: m.description,
            path,
          },
          ...m.children.map((c) => ({
            slug: c.slug,
            label: c.label,
            description: c.description,
            path: `${base}/macchinari/${c.slug}`,
          })),
        ],
      };
    }
    return {
      slug: m.slug,
      label: m.label,
      description: m.description,
      path,
    };
  }

  return {
    slug,
    label,
    description,
    path: base,
    badge: { kind: "status", active: false },
    children: [
      {
        slug: "panoramica",
        label: "Gestione Area",
        description: "Impianti, eventi di linea e stato dell’area.",
        path: base,
      },
      {
        slug: "macchinari",
        label: "Macchinari",
        description: "Impianti e stato IoT.",
        path: `${base}/macchinari`,
        children: [
          {
            slug: "elenco",
            label: "Elenco",
            description: "Elenco macchine dell’area.",
            path: `${base}/macchinari`,
          },
          ...vascaFigliNav,
          ...altreMacchine.map(macchinaNavItem),
        ],
      },
      {
        slug: "postazioni",
        label: "Postazioni",
        description: "Aree che richiedono la presenza di un operatore.",
        path: `${base}/postazioni`,
        children: [
          {
            slug: "elenco",
            label: "Elenco Postazioni",
            description: "Posti lavoro con operatore in quest’area.",
            path: `${base}/postazioni`,
          },
          ...posti.map((p) => ({
            slug: p.slug,
            label: p.label,
            description: p.description,
            path: `${base}/postazioni/${p.slug}`,
          })),
        ],
      },
    ],
  };
}

export function mergeProduzioneNavWithAree(
  aree: ProduzioneArea[]
): readonly NavItem[] {
  if (!aree.length) return PRODUZIONE_SECTIONS;
  return PRODUZIONE_SECTIONS.map((section) => {
    if (section.slug !== "gestione-aree" || !isNavBranch(section)) return section;
    return {
      ...section,
      children: [
        GESTIONE_AREE_ELENCO_NAV,
        ...aree
        .filter((a) => a.mostraInMenu !== false)
        .map((a) =>
        areaNavBranch(
          a.codice,
          a.nome,
          a.descrizione,
          a.posti
            .filter((p) => p.attivo)
            .map((p) => ({
              slug: p.codice,
              label: p.nome,
              description: p.descrizione,
            })),
          nestMacchinari((a.macchinari ?? []).filter((m) => m.attivo)).map(
            (m: ProduzioneMacchinario) => ({
              slug: m.codice,
              label: m.nome,
              description: m.descrizione,
              children: (m.figli ?? []).map((c) => ({
                slug: c.codice,
                label: c.nome,
                description: c.descrizione,
              })),
            })
          )
        )
        ),
      ],
    };
  });
}

export function getFirstProduzionePath(): string {
  return firstNavLeafPath(PRODUZIONE_SECTIONS);
}

export function resolveProduzionePage(
  segments: string[],
  sections: readonly NavItem[] = PRODUZIONE_SECTIONS
) {
  return resolveNavPage(sections, segments);
}
