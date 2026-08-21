import {
  firstNavLeafPath,
  resolveNavPage,
  type NavItem,
} from "@/lib/areas/nav-tree";

export const MAGAZZINO_SECTIONS: readonly NavItem[] = [
  {
    slug: "materia-prima",
    label: "Materia prima",
    description: "Giacenze e scorte di materia prima",
    path: "/app/magazzino/materia-prima",
  },
  {
    slug: "prodotti",
    label: "Prodotti",
    description: "Prodotti Agrinsicilia: riserva, reparto e semaforo scorte",
    path: "/app/magazzino/prodotti",
  },
  {
    slug: "note-di-acquisto",
    label: "Note di acquisto",
    description: "Note generate automaticamente dalle soglie di riserva",
    path: "/app/magazzino/note-di-acquisto",
  },
] as const;

export function getFirstMagazzinoPath(): string {
  return firstNavLeafPath(MAGAZZINO_SECTIONS);
}

export function resolveMagazzinoPage(segments: string[]) {
  return resolveNavPage(MAGAZZINO_SECTIONS, segments);
}
