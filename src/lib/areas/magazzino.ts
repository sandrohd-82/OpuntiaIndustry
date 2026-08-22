import {
  firstNavLeafPath,
  resolveNavPage,
  type NavItem,
} from "@/lib/areas/nav-tree";

export const MAGAZZINO_SECTIONS: readonly NavItem[] = [
  {
    slug: "materia-prima",
    label: "Materia prima",
    description: "Giacenze e scorte delle materie prime acquistate (Mp)",
    path: "/app/magazzino/materia-prima",
  },
  {
    slug: "prodotti",
    label: "Prodotti",
    description:
      "Prodotti fornitore acquistati (Pr): riserva, reparto e semaforo scorte",
    path: "/app/magazzino/prodotti",
  },
  {
    slug: "carico",
    label: "Carico",
    description: "Scansione barcode per carico merce in magazzino",
    path: "/app/magazzino/carico",
  },
  {
    slug: "scarico",
    label: "Scarico",
    description: "Scansione barcode per scarico merce da magazzino",
    path: "/app/magazzino/scarico",
  },
  {
    slug: "barcode",
    label: "Generatore barcode",
    description: "Anteprima Code 128/QR, associazione e stampa etichette",
    path: "/app/magazzino/barcode",
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
