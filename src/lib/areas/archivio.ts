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
    slug: "amministrazione",
    label: "Amministrazione",
    description: "Storico ordini e registro accessi",
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
    if (item.slug === "webmail") return webmailOk;
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
