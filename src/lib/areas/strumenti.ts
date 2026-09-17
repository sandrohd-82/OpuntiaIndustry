import {
  firstNavLeafPath,
  resolveNavPage,
  type NavItem,
} from "@/lib/areas/nav-tree";

export const STRUMENTI_GENERATORE_LOTTI_PATH =
  "/app/strumenti/generatore-lotti";
export const STRUMENTI_DECIFRATORE_PATH = "/app/strumenti/decifratore";

export const STRUMENTI_SECTIONS: readonly NavItem[] = [
  {
    slug: "generatore-lotti",
    label: "Generatore di Lotti",
    description: "Lotti esterni di vendita (10 caratteri) e lotti inclusivi",
    path: STRUMENTI_GENERATORE_LOTTI_PATH,
  },
  {
    slug: "decifratore",
    label: "Decifratore di lotti",
    description: "Smonta un lotto in uscita e mostra la storia del prodotto",
    path: STRUMENTI_DECIFRATORE_PATH,
  },
  {
    slug: "generatore-barcode",
    label: "Generatore barcode",
    description: "Stampa barcode e QR da un testo o da un lotto",
    path: "/app/strumenti/generatore-barcode",
  },
  {
    slug: "barcode-mp",
    label: "Barcode registrati Mp",
    description: "Barcode già associati alle schede materia prima",
    path: "/app/strumenti/barcode-mp",
  },
  {
    slug: "barcode-prodotti",
    label: "Barcode registrati prodotti",
    description: "Barcode già associati alle schede prodotti fornitore",
    path: "/app/strumenti/barcode-prodotti",
  },
  {
    slug: "editor-aree",
    label: "Editor di aree",
    description: "Disegna le piante e collegale a Magazzino → Mappa Magazzino",
    path: "/app/strumenti/editor-aree",
  },
];

export function getFirstStrumentiPath(): string {
  return firstNavLeafPath(STRUMENTI_SECTIONS);
}

export function resolveStrumentiPage(segments: string[]) {
  return resolveNavPage(STRUMENTI_SECTIONS, segments);
}
