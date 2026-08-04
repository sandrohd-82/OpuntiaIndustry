/** Sottosezioni del modulo Produzione (menu laterale) */
export const PRODUZIONE_SECTIONS = [
  {
    slug: "essiccatori",
    label: "Essiccatori",
    description: "Gestione e monitoraggio essiccatori",
    path: "/app/produzione/essiccatori",
  },
  {
    slug: "linea-di-taglio",
    label: "Linea di taglio",
    description: "Linea di taglio e avanzamento",
    path: "/app/produzione/linea-di-taglio",
  },
  {
    slug: "merce-in-ingresso",
    label: "Merce in ingresso",
    description: "Registrazione merce in ingresso",
    path: "/app/produzione/merce-in-ingresso",
  },
  {
    slug: "calendario-produzione",
    label: "Calendario produzione",
    description: "Pianificazione e calendario di produzione",
    path: "/app/produzione/calendario-produzione",
  },
  {
    slug: "turnistica",
    label: "Turnistica",
    description: "Turni e organizzazione del personale produttivo",
    path: "/app/produzione/turnistica",
  },
  {
    slug: "statistiche",
    label: "Statistiche",
    description: "Indicatori e report di produzione",
    path: "/app/produzione/statistiche",
  },
] as const;

export type ProduzioneSectionSlug = (typeof PRODUZIONE_SECTIONS)[number]["slug"];

export function getProduzioneSection(slug: string) {
  return PRODUZIONE_SECTIONS.find((section) => section.slug === slug) ?? null;
}
