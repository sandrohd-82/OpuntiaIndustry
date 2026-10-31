import {
  firstNavLeafPath,
  isNavBranch,
  resolveNavPage,
  type NavItem,
} from "@/lib/areas/nav-tree";
import type { ProduzioneArea } from "@/lib/produzione/aree-posti";
import { abbreviaTitoloRoutine } from "@/lib/produzione/haccp";
import { nestMacchinari, type ProduzioneMacchinario } from "@/lib/produzione/macchinari";

export type { NavBranch, NavLeaf, NavItem as ProduzioneNavItem } from "@/lib/areas/nav-tree";
export { isNavBranch };

/** Sidebar: ricarica il menu aree/posti dopo CRUD catalogo. */
export const PRODUZIONE_AREE_NAV_EVENT = "opuntia-aree-updated";
/** Sidebar: ricarica l'elenco routine HACCP. */
export const HACCP_ROUTINE_NAV_EVENT = "opuntia-haccp-routine-updated";

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
        slug: "da-processare",
        label: "Da processare",
        description:
          "Ordini inseriti da passare in produzione (solo Admin)",
        path: "/app/produzione/ordini/da-processare",
        adminOnly: true,
      },
      {
        slug: "scaletta",
        label: "Scaletta Produzione",
        description:
          "Calendario lavorazioni e attività in scaletta, da collegare ai fogli",
        path: "/app/produzione/ordini/scaletta",
      },
      {
        slug: "schede",
        label: "Schede Ordini",
        description:
          "Schede aperte e complete con timeline di lavorazione e confezionamento",
        path: "/app/produzione/ordini/schede",
      },
      {
        slug: "in-attesa-ritiro",
        label: "In Attesa Ritiro",
        description:
          "Pronti per il ritiro: ora, corriere, poi Partito per 30 giorni",
        path: "/app/produzione/ordini/in-attesa-ritiro",
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
    slug: "controlli-haccp",
    label: "Controlli e HACCP",
    description: "Linee guida e routine periodiche di pulizia, sanificazione e controlli",
    path: "/app/produzione/controlli-haccp",
    children: [
      {
        slug: "linee-guida",
        label: "Linee guida",
        description:
          "Pagine di stabilimento su HACCP, pulizia, sanificazione e procedure operative standard",
        path: "/app/produzione/controlli-haccp/linee-guida",
      },
      {
        slug: "routine",
        label: "Routine",
        description: "Tutti i processi che devono essere fatti periodicamente",
        path: "/app/produzione/controlli-haccp/routine",
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

/** Barre leggibili sul blu scuro del menu. Il colore di famiglia resta riconoscibile. */
const ROUTINE_MARK_MENU: Record<string, string> = {
  pulizia: "#60a5fa",
  sanificazione: "#4ade80",
  controlli: "#facc15",
  manutenzione: "#e7c4a4",
};

export function mergeProduzioneNavWithRoutine(
  sections: readonly NavItem[],
  categorie: readonly { id: string; codice: string; nome: string; colore: string }[],
  voci: readonly { id: string; categoriaId: string; titolo: string; scadenzaAt: string }[]
): readonly NavItem[] {
  if (!voci.length) return sections;
  const perId = new Map(categorie.map((categoria) => [categoria.id, categoria]));
  const children: NavItem[] = [...voci]
    .sort((a, b) => {
      const ta = new Date(a.scadenzaAt).getTime();
      const tb = new Date(b.scadenzaAt).getTime();
      if (!Number.isFinite(ta) && !Number.isFinite(tb)) return 0;
      if (!Number.isFinite(ta)) return 1;
      if (!Number.isFinite(tb)) return -1;
      return ta - tb;
    })
    .map((voce) => {
      const categoria = perId.get(voce.categoriaId);
      return {
        slug: `routine-${voce.id}`,
        label: abbreviaTitoloRoutine(voce.titolo),
        description: categoria ? `${categoria.nome}: ${voce.titolo}` : voce.titolo,
        path: `/app/produzione/controlli-haccp/routine?voce=${voce.id}`,
        markColor:
          (categoria && ROUTINE_MARK_MENU[categoria.codice]) || categoria?.colore || "#94a3b8",
        countdownTo: voce.scadenzaAt,
      };
    });

  return sections.map((section) => {
    if (section.slug !== "controlli-haccp" || !isNavBranch(section)) return section;
    return {
      ...section,
      children: section.children.map((child) =>
        child.slug === "routine" ? { ...child, children } : child
      ),
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
