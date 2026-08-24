import type { AreaSlug } from "@/types/database";

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
  "magazzino",
  "chat",
  "area-fiscale",
  "area-fornitori",
  "impostazioni",
];

/** Aree non mostrate nel menu (ancora raggiungibili se in permessi). */
export const SIDEBAR_HIDDEN_AREAS: ReadonlySet<AreaSlug> = new Set([
  "commerciale",
  "acquisti",
  "hr",
]);

export function areaPathFromSlug(slug: AreaSlug): string {
  return AREA_ROUTES[slug].path;
}

export function slugFromPath(pathname: string): AreaSlug | null {
  const match = pathname.match(/^\/app\/([^/]+)/);
  if (!match) return null;
  const slug = match[1] as AreaSlug;
  return slug in AREA_ROUTES ? slug : null;
}
