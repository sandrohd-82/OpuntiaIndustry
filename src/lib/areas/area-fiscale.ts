import {
  firstNavLeafPath,
  resolveNavPage,
  type NavItem,
} from "@/lib/areas/nav-tree";

/** Menu Area Fiscale — include fatture, NC, DDT, banca */
export const AREA_FISCALE_SECTIONS: readonly NavItem[] = [
  {
    slug: "fatture",
    label: "Fatture",
    description: "Emissione ed elenco fatture (Fatture in Cloud)",
    path: "/app/area-fiscale/fatture",
    children: [
      {
        slug: "nuova",
        label: "+ Nuova Fattura",
        description: "Crea e invia fattura collegata a Fatture in Cloud",
        path: "/app/area-fiscale/fatture/nuova",
      },
      {
        slug: "emesse",
        label: "Elenco Emesse",
        description: "Storico fatture emesse ai clienti",
        path: "/app/area-fiscale/fatture/emesse",
      },
      {
        slug: "ricevute",
        label: "Elenco Ricevute",
        description: "Storico fatture ricevute dai fornitori",
        path: "/app/area-fiscale/fatture/ricevute",
      },
    ],
  },
  {
    slug: "note-di-credito",
    label: "Note di credito",
    description: "Note di credito emesse e ricevute",
    path: "/app/area-fiscale/note-di-credito",
    children: [
      {
        slug: "nuova",
        label: "+ Nuova Nota",
        description: "Crea nota di credito da inviare (Fatture in Cloud)",
        path: "/app/area-fiscale/note-di-credito/nuova",
      },
      {
        slug: "emesse",
        label: "Elenco Note Emesse",
        description: "Note di credito inviate",
        path: "/app/area-fiscale/note-di-credito/emesse",
      },
      {
        slug: "ricevute",
        label: "Elenco Note Ricevute",
        description: "Note di credito ricevute",
        path: "/app/area-fiscale/note-di-credito/ricevute",
      },
    ],
  },
  {
    slug: "ddt",
    label: "DDT",
    description: "Documenti di trasporto emessi e ricevuti",
    path: "/app/area-fiscale/ddt",
    children: [
      {
        slug: "nuovo",
        label: "+ Nuovo DDT",
        description: "Crea DDT da inviare (Fatture in Cloud)",
        path: "/app/area-fiscale/ddt/nuovo",
      },
      {
        slug: "emessi",
        label: "Elenco DDT Emessi",
        description: "DDT inviati",
        path: "/app/area-fiscale/ddt/emessi",
      },
      {
        slug: "ricevuti",
        label: "Elenco DDT Ricevuti",
        description: "DDT ricevuti",
        path: "/app/area-fiscale/ddt/ricevuti",
      },
    ],
  },
  {
    slug: "dati-e-calcoli",
    label: "Dati e calcoli",
    description: "IVA, utili e analisi costi",
    path: "/app/area-fiscale/dati-e-calcoli",
    children: [
      {
        slug: "iva-e-imposte",
        label: "Iva e imposte",
        description: "Liquidazione IVA e adempimenti",
        path: "/app/area-fiscale/dati-e-calcoli/iva-e-imposte",
      },
      {
        slug: "utili",
        label: "Utili",
        description: "Differenze fra incassi e uscite",
        path: "/app/area-fiscale/dati-e-calcoli/utili",
      },
      {
        slug: "analisi-costi",
        label: "Analisi Costi",
        description: "Analisi dei costi di gestione",
        path: "/app/area-fiscale/dati-e-calcoli/analisi-costi",
      },
    ],
  },
  {
    slug: "banca",
    label: "Banca",
    description: "Movimenti, bonifici e pagamenti dipendenti",
    path: "/app/area-fiscale/banca",
    children: [
      {
        slug: "movimenti",
        label: "Elenco Movimenti",
        description: "Movimenti bancari e riconciliazione",
        path: "/app/area-fiscale/banca/movimenti",
      },
      {
        slug: "disponi-bonifico",
        label: "+ Disponi bonifico",
        description:
          "Bonifici in attesa di conferma degli amministratori",
        path: "/app/area-fiscale/banca/disponi-bonifico",
      },
      {
        slug: "pagamenti-dipendenti",
        label: "Pagamenti Dipendenti",
        description: "Elenco e disposizione pagamento buste paga",
        path: "/app/area-fiscale/banca/pagamenti-dipendenti",
      },
    ],
  },
  {
    slug: "commercialista",
    label: "Commercialista",
    description: "Area riservata al commercialista",
    path: "/app/area-fiscale/commercialista",
  },
] as const;

export function getFirstAreaFiscalePath(): string {
  return firstNavLeafPath(AREA_FISCALE_SECTIONS);
}

export function resolveAreaFiscalePage(segments: string[]) {
  return resolveNavPage(AREA_FISCALE_SECTIONS, segments);
}
