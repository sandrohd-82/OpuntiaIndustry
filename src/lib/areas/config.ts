import type { AreaSlug, UserArea } from "@/types/database";

/** Metadati UI per le aree (routing e navigazione) */
export const AREA_ROUTES: Record<
  AreaSlug,
  { path: string; label: string; description: string }
> = {
  dashboard: {
    path: "/app/dashboard",
    label: "Dashboard",
    description: "Panoramica e indicatori",
  },
  amministrazione: {
    path: "/app/amministrazione",
    label: "Amministrazione",
    description: "Clienti, fornitori, schede, ordini e organigramma",
  },
  produzione: {
    path: "/app/produzione",
    label: "Produzione",
    description: "Fogli, processi, aree e calendari",
  },
  archivio: {
    path: "/app/archivio",
    label: "Archivio",
    description: "Storici, archivi e tracciabilità delle aree operative",
  },
  magazzino: {
    path: "/app/magazzino",
    label: "Magazzino",
    description: "Giacenze, movimenti e note di acquisto",
  },
  chat: {
    path: "/app/chat",
    label: "Chat",
    description: "Argomenti e discussioni operative",
  },
  webmail: {
    path: "/app/webmail",
    label: "WebMail",
    description: "Caselle aziendali, categorie e anagrafiche",
  },
  "promemorie-e-note": {
    path: "/app/promemorie-e-note",
    label: "Promemorie e note",
    description: "Promemoria, attività e note collegabili",
  },
  "area-fiscale": {
    path: "/app/area-fiscale",
    label: "Area Fiscale",
    description: "Fatture, banca, calcoli e commercialista",
  },
  "area-fornitori": {
    path: "/app/area-fornitori",
    label: "Gestionale Fornitori",
    description: "Quaderno di campagna e calendario raccolto",
  },
  "ricerca-sviluppo": {
    path: "/app/ricerca-sviluppo",
    label: "Ricerca e sviluppo",
    description: "Ricerche processi e materie prime — timeline report",
  },
  wikiopuntia: {
    path: "/app/wikiopuntia",
    label: "WikiOpuntia",
    description:
      "Biblioteca scientifica, Knowledge Base AI e pubblicazione wikiopuntia.com",
  },
  commerciale: {
    path: "/app/commerciale",
    label: "Commerciale",
    description: "Clienti con storico e clienti contattati",
  },
  acquisti: {
    path: "/app/acquisti",
    label: "Acquisti",
    description: "Fornitori e ordini di acquisto",
  },
  hr: {
    path: "/app/hr",
    label: "Risorse umane",
    description: "Personale e presenze",
  },
  impostazioni: {
    path: "/app/impostazioni",
    label: "Impostazioni",
    description:
      "Configurazione sistema, Google Authenticator e profilo fiscale aziendale",
  },
};

/** Aree mostrate nel menu laterale (ordine). Altre restano in RBAC ma nascoste. */
export const SIDEBAR_AREA_ORDER: AreaSlug[] = [
  "dashboard",
  "amministrazione",
  "ricerca-sviluppo",
  "produzione",
  "chat",
  "webmail",
  "magazzino",
  "promemorie-e-note",
  "area-fiscale",
  "area-fornitori",
  "impostazioni",
  "archivio",
];

/** Aree non mostrate nel menu (ancora raggiungibili se in permessi). */
export const SIDEBAR_HIDDEN_AREAS: ReadonlySet<AreaSlug> = new Set([
  "commerciale",
  "acquisti",
  "hr",
  "wikiopuntia",
]);

export function areaPathFromSlug(slug: AreaSlug): string {
  return AREA_ROUTES[slug].path;
}

/** Prima area visibile nel menu per l’utente (dopo switch profilo). */
export function firstAreaPath(areas: UserArea[]): string | null {
  const slugs = new Set(areas.map((a) => a.slug));
  for (const slug of SIDEBAR_AREA_ORDER) {
    if (SIDEBAR_HIDDEN_AREAS.has(slug)) continue;
    if (slugs.has(slug)) return AREA_ROUTES[slug].path;
  }
  const fallback = areas[0]?.slug;
  return fallback ? AREA_ROUTES[fallback]?.path ?? null : null;
}

export function slugFromPath(pathname: string): AreaSlug | null {
  const match = pathname.match(/^\/app\/([^/]+)/);
  if (!match) return null;
  const slug = match[1] as AreaSlug;
  return slug in AREA_ROUTES ? slug : null;
}
