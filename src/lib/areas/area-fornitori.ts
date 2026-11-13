import {
  firstNavLeafPath,
  resolveNavPage,
  type NavItem,
} from "@/lib/areas/nav-tree";

/** Menu Gestionale Fornitori (esterna / collaborativa) */
export const AREA_FORNITORI_SECTIONS: readonly NavItem[] = [
  {
    slug: "quaderno-di-campagna",
    label: "Quaderno di campagna",
    description: "Quaderno di campagna dei fornitori",
    path: "/app/area-fornitori/quaderno-di-campagna",
  },
  {
    slug: "calendario-raccolto",
    label: "Calendario Raccolto",
    description: "Calendario raccolto fornitori",
    path: "/app/area-fornitori/calendario-raccolto",
  },
  {
    slug: "linee-guida",
    label: "Linee guida",
    description:
      "Documenti HACCP destinati alla tua azienda e presa visione della versione ricevuta",
    path: "/app/area-fornitori/linee-guida",
  },
  {
    slug: "materiale-in-ingresso",
    label: "Materiale in ingresso",
    description:
      "Parte del fornitore sul foglio di controllo, fino alla partenza verso Agrinsicilia",
    path: "/app/area-fornitori/materiale-in-ingresso",
  },
] as const;

export function getFirstAreaFornitoriPath(): string {
  return firstNavLeafPath(AREA_FORNITORI_SECTIONS);
}

export function resolveAreaFornitoriPage(segments: string[]) {
  return resolveNavPage(AREA_FORNITORI_SECTIONS, segments);
}
