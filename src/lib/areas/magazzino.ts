import {
  findNavItem,
  firstLeafPath,
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
    label: "Barcode",
    description:
      "Elenchi barcode registrati e generazione (lotto / stringa libera)",
    path: "/app/magazzino/barcode",
    children: [
      {
        slug: "lotto-materia-prima",
        label: "Lotto materia prima",
        description:
          "Elenco barcode registrati sulle schede materia prima (Mp)",
        path: "/app/magazzino/barcode/lotto-materia-prima",
      },
      {
        slug: "lotto-prodotto-finito",
        label: "Lotto prodotto finito",
        description:
          "Elenco barcode registrati sulle schede prodotto (Pr)",
        path: "/app/magazzino/barcode/lotto-prodotto-finito",
      },
      {
        slug: "generatore",
        label: "Generatore",
        description:
          "Creazione barcode lotto Mp/PF e generatore generico (stringa)",
        path: "/app/magazzino/barcode/generatore",
        children: [
          {
            slug: "lotto-materia-prima",
            label: "Lotto materia prima",
            description:
              "Creazione barcode del numero di lotto materia prima (impostazioni dedicate)",
            path: "/app/magazzino/barcode/generatore/lotto-materia-prima",
          },
          {
            slug: "lotto-prodotto-finito",
            label: "Lotto prodotto finito",
            description:
              "Creazione barcode del numero di lotto prodotto finito (impostazioni dedicate)",
            path: "/app/magazzino/barcode/generatore/lotto-prodotto-finito",
          },
          {
            slug: "generico",
            label: "Generico",
            description:
              "Converte una stringa libera in barcode (anteprima e stampa)",
            path: "/app/magazzino/barcode/generatore/generico",
          },
        ],
      },
    ],
  },
  {
    slug: "note-di-acquisto",
    label: "Note di acquisto",
    description: "Note generate automaticamente dalle soglie di riserva",
    path: "/app/magazzino/note-di-acquisto",
  },
];

export function getFirstMagazzinoPath(): string {
  return firstNavLeafPath(MAGAZZINO_SECTIONS);
}

export function resolveMagazzinoPage(segments: string[]) {
  return resolveNavPage(MAGAZZINO_SECTIONS, segments);
}

export function getMagazzinoFirstLeafPath(segments: string[]): string | null {
  const item = findNavItem(MAGAZZINO_SECTIONS, segments);
  if (!item) return null;
  return firstLeafPath(item);
}
