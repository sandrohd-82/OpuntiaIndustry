import {
  firstNavLeafPath,
  resolveNavPage,
  type NavItem,
} from "@/lib/areas/nav-tree";

/**
 * Chiavi On/Off già esistenti (Amministrazione / Area Fiscale).
 * I path Commerciale le riusano: i permessi operatore non cambiano.
 */
export const COMMERCIALE_PAGE_ALIASES: Record<string, string> = {
  "/app/commerciale/clienti": "/app/amministrazione/clienti/elenco",
  "/app/commerciale/possibili-clienti":
    "/app/amministrazione/clienti/possibili",
  "/app/commerciale/preventivi": "/app/amministrazione/ordini/preventivi",
  "/app/commerciale/ordini/elenco": "/app/amministrazione/ordini/elenco",
  "/app/commerciale/ordini/nuovo": "/app/amministrazione/ordini/nuovo",
  "/app/commerciale/ordini/crea-nuovo": "/app/amministrazione/ordini/nuovo",
  "/app/commerciale/listino": "/app/amministrazione/schede/listini-b2b",
  "/app/commerciale/nuova-fattura": "/app/area-fiscale/fatture/nuova",
};

/** Menu Commerciale di primo livello */
export const COMMERCIALE_SECTIONS: readonly NavItem[] = [
  {
    slug: "clienti",
    label: "Clienti",
    description: "Anagrafiche clienti attive",
    path: "/app/commerciale/clienti",
  },
  {
    slug: "possibili-clienti",
    label: "Possibili Clienti",
    description: "Contatti e nuove aziende da valutare (lead / prospect)",
    path: "/app/commerciale/possibili-clienti",
  },
  {
    slug: "preventivi",
    label: "Preventivi",
    description: "Preventivi creati, inviati, accettati o respinti",
    path: "/app/commerciale/preventivi",
  },
  {
    slug: "ordini",
    label: "Ordini",
    description: "Elenco e nuovo ordine merce o campionatura",
    path: "/app/commerciale/ordini",
    children: [
      {
        slug: "elenco",
        label: "Elenco ordini",
        description: "Ordini merce e campionatura",
        path: "/app/commerciale/ordini/elenco",
      },
      {
        slug: "nuovo",
        label: "Nuovo ordine",
        description: "Crea un ordine merce o una campionatura",
        path: "/app/commerciale/ordini/nuovo",
      },
    ],
  },
  {
    slug: "listino",
    label: "Listino",
    description: "Listino in carica e scontistica (sola consultazione)",
    path: "/app/commerciale/listino",
  },
  {
    slug: "nuova-fattura",
    label: "Nuova Fattura",
    description: "Crea e invia fattura collegata a Fatture in Cloud",
    path: "/app/commerciale/nuova-fattura",
  },
] as const;

export function getFirstCommercialePath(): string {
  return firstNavLeafPath(COMMERCIALE_SECTIONS);
}

export function resolveCommercialePage(segments: string[]) {
  return resolveNavPage(COMMERCIALE_SECTIONS, segments);
}

export function commercialeLegacyPageKey(pathname: string): string | null {
  const raw = pathname.split("?")[0]?.replace(/\/+$/, "") || "";
  if (COMMERCIALE_PAGE_ALIASES[raw]) return COMMERCIALE_PAGE_ALIASES[raw];
  for (const [from, to] of Object.entries(COMMERCIALE_PAGE_ALIASES)) {
    if (raw.startsWith(`${from}/`)) return to;
  }
  return null;
}
