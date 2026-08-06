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
  commerciale: {
    path: "/app/commerciale",
    label: "Commerciale",
    description: "Clienti con storico e clienti contattati",
  },
  produzione: {
    path: "/app/produzione",
    label: "Produzione",
    description: "Pianificazione e avanzamento lavori",
  },
  magazzino: {
    path: "/app/magazzino",
    label: "Magazzino",
    description: "Giacenze e movimenti",
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
  amministrazione: {
    path: "/app/amministrazione",
    label: "Amministrazione",
    description: "Ordini, fatture e dipendenti",
  },
  impostazioni: {
    path: "/app/impostazioni",
    label: "Impostazioni",
    description: "Configurazione sistema e Google Authenticator (solo superadmin)",
  },
};

export function areaPathFromSlug(slug: AreaSlug): string {
  return AREA_ROUTES[slug].path;
}

export function slugFromPath(pathname: string): AreaSlug | null {
  const match = pathname.match(/^\/app\/([^/]+)/);
  if (!match) return null;
  const slug = match[1] as AreaSlug;
  return slug in AREA_ROUTES ? slug : null;
}
