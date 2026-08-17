import {
  firstNavLeafPath,
  resolveNavPage,
  type NavItem,
} from "@/lib/areas/nav-tree";

/** Sottosezioni Area Fiscale (menu laterale) */
export const AREA_FISCALE_SECTIONS: readonly NavItem[] = [
  {
    slug: "dati-e-calcoli",
    label: "Dati e calcoli",
    description:
      "Liquidazione IVA, utile/stime tasse, scadenzario (Cooperativa Agricola e Sociale A.R.L.)",
    path: "/app/area-fiscale/dati-e-calcoli",
  },
  {
    slug: "il-commercialista",
    label: "Il Commercialista",
    description:
      "Riepilogo trimestrale emesse/ricevute (prodotti, materiale di consumo, beni ammortizzabili). Accessibile anche al Super Admin.",
    path: "/app/area-fiscale/il-commercialista",
  },
] as const;

export function getFirstAreaFiscalePath(): string {
  return firstNavLeafPath(AREA_FISCALE_SECTIONS);
}

export function resolveAreaFiscalePage(segments: string[]) {
  return resolveNavPage(AREA_FISCALE_SECTIONS, segments);
}
