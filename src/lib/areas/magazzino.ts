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
    label: "Barcode",
    description:
      "Creazione barcode lotto e generatore generico (stringa → codice)",
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
        slug: "generico",
        label: "Generatore generico",
        description:
          "Stringa → barcode: modello, Code 128/QR, stampa e associazione scheda",
        path: "/app/magazzino/barcode/generico",
      },
    ],
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
