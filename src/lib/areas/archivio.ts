import {
  firstNavLeafPath,
  isNavBranch,
  resolveNavPage,
  type NavItem,
} from "@/lib/areas/nav-tree";
import type { AreaSlug, UserArea } from "@/types/database";

/** Menu Archivio: stessi rami dell’area originale, solo voci di storico/archivio. */
export const ARCHIVIO_SECTIONS: readonly NavItem[] = [
  {
    slug: "tutorial",
    label: "Tutorial",
    description:
      "Guida di tutte le aree, i lotti e i processi (indice e ricerca nella pagina)",
    path: "/app/archivio/tutorial",
  },
  {
    slug: "iot",
    label: "IoT",
    description:
      "Frame Mex 7E + corpo lettere h/l/r/i/s",
    path: "/app/archivio/iot",
    children: [
      {
        slug: "leggenda-mex",
        label: "Leggenda Mex",
        description:
          "Frame 7E 0F 49… e corpo h/l/r/i/s (invio e conferma)",
        path: "/app/archivio/iot/leggenda-mex",
      },
      {
        slug: "wiki",
        label: "Wiki",
        description:
          "Documentazione IoT / Action: protocollo, sicurezza, apprendimento e API",
        path: "/app/archivio/iot/wiki",
      },
    ],
  },
  {
    slug: "amministrazione",
    label: "Amministrazione",
    description: "Storico ordini, registro accessi e documentazioni archiviate",
    path: "/app/archivio/amministrazione",
    children: [
      {
        slug: "ordini",
        label: "Ordini",
        description: "Storico ordini conclusi",
        path: "/app/archivio/amministrazione/ordini",
        children: [
          {
            slug: "storico",
            label: "Storico",
            description: "Ordini e processi già conclusi",
            path: "/app/archivio/amministrazione/ordini/storico",
          },
        ],
      },
      {
        slug: "registro-accessi",
        label: "Registro accessi",
        description: "Accessi al gestionale: timeline o elenco",
        path: "/app/archivio/amministrazione/registro-accessi",
      },
      {
        slug: "documentazioni",
        label: "Documentazioni",
        description:
          "Documentazioni scadute archiviate dopo consenso Super Admin",
        path: "/app/archivio/amministrazione/documentazioni",
        superAdminOnly: true,
      },
    ],
  },
  {
    slug: "ricerca-sviluppo",
    label: "Ricerca e sviluppo",
    description: "Archivio ricerche scientifiche",
    path: "/app/archivio/ricerca-sviluppo",
    children: [
      {
        slug: "ricerche-scientifiche",
        label: "Ricerche Scientifiche",
        description:
          "Archivio unificato delle ricerche scientifiche (processi e materie prime)",
        path: "/app/archivio/ricerca-sviluppo/ricerche-scientifiche",
      },
    ],
  },
  {
    slug: "produzione",
    label: "Produzione",
    description: "Storico fogli, processi e attività",
    path: "/app/archivio/produzione",
    children: [
      {
        slug: "foglio-ingresso-mp",
        label: "Foglio Ingresso MP",
        description: "Storico fogli ingresso e Codice MP Lavorata",
        path: "/app/archivio/produzione/foglio-ingresso-mp",
        children: [
          {
            slug: "storico",
            label: "Storico",
            description:
              "Fogli ingresso chiusi e fogli Codice MP Lavorata da carico/settaggio magazzino",
            path: "/app/archivio/produzione/foglio-ingresso-mp/storico",
          },
        ],
      },
      {
        slug: "fogli-lavorazione",
        label: "Fogli di lavorazione",
        description: "Storico fogli",
        path: "/app/archivio/produzione/fogli-lavorazione",
        children: [
          {
            slug: "storico",
            label: "Storico Fogli",
            description: "Storico dei fogli di lavorazione",
            path: "/app/archivio/produzione/fogli-lavorazione/storico",
          },
        ],
      },
      {
        slug: "ordini",
        label: "Ordini",
        description: "Schede e scaletta produzione archiviate",
        path: "/app/archivio/produzione/ordini",
        children: [
          {
            slug: "schede",
            label: "Schede Ordini",
            description:
              "Schede complete da più di un mese, con timeline consultabile",
            path: "/app/archivio/produzione/ordini/schede",
          },
          {
            slug: "scaletta",
            label: "Scaletta Produzione",
            description:
              "Lavorazioni e confezionamenti chiusi, stesso calendario della scaletta operativa",
            path: "/app/archivio/produzione/ordini/scaletta",
          },
        ],
      },
      {
        slug: "processi-e-attivita",
        label: "Processi e attività",
        description: "Storico processi e attività",
        path: "/app/archivio/produzione/processi-e-attivita",
        children: [
          {
            slug: "storico-processi",
            label: "Storico Processi",
            description: "Processi deprecati con traccia visibile",
            path: "/app/archivio/produzione/processi-e-attivita/storico-processi",
          },
          {
            slug: "storico-attivita",
            label: "Storico Attività",
            description: "Attività deprecate con traccia visibile",
            path: "/app/archivio/produzione/processi-e-attivita/storico-attivita",
          },
        ],
      },
    ],
  },
  {
    slug: "chat",
    label: "Chat",
    description: "Storico argomenti e chat eliminate",
    path: "/app/archivio/chat",
    children: [
      {
        slug: "argomenti",
        label: "Per argomento",
        description: "Argomenti archiviati",
        path: "/app/archivio/chat/argomenti",
        children: [
          {
            slug: "storico",
            label: "Storico",
            description: "Argomenti archiviati",
            path: "/app/archivio/chat/argomenti/storico",
          },
        ],
      },
      {
        slug: "dirette",
        label: "Fra utenti",
        description: "Chat 1:1 eliminate",
        path: "/app/archivio/chat/dirette",
        children: [
          {
            slug: "eliminate",
            label: "Eliminate",
            description:
              "Chat ufficialmente eliminate, conservate qui per traccia",
            path: "/app/archivio/chat/dirette/eliminate",
          },
        ],
      },
    ],
  },
  {
    slug: "webmail",
    label: "WebMail",
    description: "Mail archiviate per casella",
    path: "/app/archivio/webmail",
    children: [
      {
        slug: "caselle",
        label: "Caselle Mail",
        description: "Caselle con cartella Archiviate",
        path: "/app/archivio/webmail/caselle",
        children: [],
      },
    ],
  },
  {
    slug: "magazzino",
    label: "Magazzino",
    description: "Storico materia prima, prodotti e note",
    path: "/app/archivio/magazzino",
    children: [
      {
        slug: "materia-prima",
        label: "Materia Prima",
        description: "Storico materia prima",
        path: "/app/archivio/magazzino/materia-prima",
        children: [
          {
            slug: "storico",
            label: "Storico",
            description: "Storico materia prima transitata in azienda",
            path: "/app/archivio/magazzino/materia-prima/storico",
          },
        ],
      },
      {
        slug: "prodotti-di-consumo",
        label: "Prodotti di consumo",
        description: "Prodotti eliminati o obsoleti",
        path: "/app/archivio/magazzino/prodotti-di-consumo",
        children: [
          {
            slug: "eliminati-obsoleti",
            label: "Eliminati/obsoleti",
            description: "Prodotti eliminati o dichiarati obsoleti",
            path: "/app/archivio/magazzino/prodotti-di-consumo/eliminati-obsoleti",
          },
        ],
      },
      {
        slug: "note-di-acquisto",
        label: "Note",
        description: "Storico note di acquisto",
        path: "/app/archivio/magazzino/note-di-acquisto",
        children: [
          {
            slug: "storico",
            label: "Storico",
            description: "Storico note di acquisto",
            path: "/app/archivio/magazzino/note-di-acquisto/storico",
          },
        ],
      },
    ],
  },
  {
    slug: "strumenti",
    label: "Strumenti",
    description: "Ticket risolti sul gestionale",
    path: "/app/archivio/strumenti",
    children: [
      {
        slug: "ticket",
        label: "Ticket",
        description: "Ticket risolti e archiviati (bug, funzioni, miglioramenti)",
        path: "/app/archivio/strumenti/ticket",
      },
    ],
  },
  {
    slug: "area-fiscale",
    label: "Area Fiscale",
    description: "Archivio contratti",
    path: "/app/archivio/area-fiscale",
    children: [
      {
        slug: "contratti",
        label: "Contratti",
        description: "Contratti archiviati",
        path: "/app/archivio/area-fiscale/contratti",
        children: [
          {
            slug: "archivio",
            label: "Archivio",
            description: "Contratti archiviati o scaduti",
            path: "/app/archivio/area-fiscale/contratti/archivio",
          },
        ],
      },
    ],
  },
];

const ARCHIVIO_SOURCE_SLUGS: AreaSlug[] = [
  "amministrazione",
  "ricerca-sviluppo",
  "produzione",
  "chat",
  "webmail",
  "magazzino",
  "strumenti",
  "area-fiscale",
];

export function filterArchivioNavByAccess(
  areas: UserArea[],
  sections: readonly NavItem[] = ARCHIVIO_SECTIONS
): NavItem[] {
  const have = new Set(areas.map((a) => a.slug));
  const webmailOk =
    have.has("webmail") ||
    have.has("amministrazione") ||
    have.has("commerciale");
  return sections.filter((item) => {
    if (item.slug === "tutorial" || item.slug === "iot") {
      return have.has("archivio");
    }
    if (item.slug === "webmail") return webmailOk;
    if (item.slug === "strumenti") {
      return have.has("strumenti") || have.has("amministrazione");
    }
    return have.has(item.slug as AreaSlug);
  });
}

export function mergeArchivioWebmailCaselle(
  sections: readonly NavItem[],
  accounts: Array<{ id: string; label: string }>
): NavItem[] {
  return sections.map((item) => {
    if (item.slug !== "webmail" || !isNavBranch(item)) return item;
    return {
      ...item,
      children: item.children.map((child) => {
        if (child.slug !== "caselle") return child;
        return {
          ...child,
          children: accounts.map((acc) => ({
            slug: acc.id,
            label: acc.label,
            description: `Mail archiviate · ${acc.label}`,
            path: `/app/archivio/webmail/caselle/${acc.id}`,
            children: [
              {
                slug: "archiviate",
                label: "Archiviate",
                description: `Mail archiviate della casella ${acc.label}`,
                path: `/app/archivio/webmail/caselle/${acc.id}/archiviate`,
              },
            ],
          })),
        };
      }),
    };
  });
}

export function getFirstArchivioPath(sections: readonly NavItem[] = ARCHIVIO_SECTIONS) {
  return firstNavLeafPath(sections);
}

export function resolveArchivioPage(segments: string[]) {
  return resolveNavPage(ARCHIVIO_SECTIONS, segments);
}

export { ARCHIVIO_SOURCE_SLUGS };
