import {
  firstNavLeafPath,
  resolveNavPage,
  type NavItem,
} from "@/lib/areas/nav-tree";

/** Menu WikiOpuntia — biblioteca pubblica + Knowledge Base AI */
export const WIKIOPUNTIA_SECTIONS: readonly NavItem[] = [
  {
    slug: "biblioteca",
    label: "Biblioteca scientifica",
    description: "Paper per wikiopuntia.com (stati e versioni ISO 9001)",
    path: "/app/wikiopuntia/biblioteca",
    children: [
      {
        slug: "elenco",
        label: "Elenco",
        description: "Ricerche in bozza, approvate o pubblicate",
        path: "/app/wikiopuntia/biblioteca/elenco",
      },
      {
        slug: "nuova",
        label: "+ Nuova ricerca",
        description: "Carica un paper (bozza, versione 1)",
        path: "/app/wikiopuntia/biblioteca/nuova",
      },
      {
        slug: "archivio",
        label: "Archivio",
        description: "Ricerche archiviate / ritirate",
        path: "/app/wikiopuntia/biblioteca/archivio",
      },
    ],
  },
  {
    slug: "knowledge-base",
    label: "Knowledge Base AI",
    description: "Stato ingest PDF e chunk pgvector per i chatbot",
    path: "/app/wikiopuntia/knowledge-base",
  },
  {
    slug: "richieste-documenti",
    label: "Richieste PDF",
    description: "Visitatori che chiedono un documento non pubblico",
    path: "/app/wikiopuntia/richieste-documenti",
  },
  {
    slug: "richieste-contatto",
    label: "Richieste di contatto",
    description: "Form contatti da wikiopuntia.com",
    path: "/app/wikiopuntia/richieste-contatto",
  },
] as const;

export function getFirstWikiopuntiaPath(): string {
  return firstNavLeafPath(WIKIOPUNTIA_SECTIONS);
}

export function resolveWikiopuntiaPage(segments: string[]) {
  return resolveNavPage(WIKIOPUNTIA_SECTIONS, segments);
}
