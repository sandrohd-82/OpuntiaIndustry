import {
  firstNavLeafPath,
  resolveNavPage,
  type NavItem,
} from "@/lib/areas/nav-tree";

/** Sottosezioni del modulo Amministrazione (menu laterale) */
export const AMMINISTRAZIONE_SECTIONS: readonly NavItem[] = [
  {
    slug: "clienti",
    label: "Clienti",
    description: "Anagrafiche clienti",
    path: "/app/amministrazione/clienti",
  },
  {
    slug: "fornitori",
    label: "Fornitori",
    description:
      "Anagrafiche fornitori: tutti, oppure filtrati per servizi, prodotti, materia prima",
    path: "/app/amministrazione/fornitori",
    children: [
      {
        slug: "tutti",
        label: "Tutti",
        description: "Tutti i fornitori insieme",
        path: "/app/amministrazione/fornitori/tutti",
      },
      {
        slug: "servizi",
        label: "Servizi",
        description: "Fornitori che offrono servizi",
        path: "/app/amministrazione/fornitori/servizi",
      },
      {
        slug: "prodotti",
        label: "Prodotti",
        description: "Fornitori che offrono prodotti",
        path: "/app/amministrazione/fornitori/prodotti",
      },
      {
        slug: "materia-prima",
        label: "Materia prima",
        description: "Fornitori di materia prima",
        path: "/app/amministrazione/fornitori/materia-prima",
      },
    ],
  },
  {
    slug: "schede",
    label: "Schede",
    description: "Cataloghi e schede di riferimento",
    path: "/app/amministrazione/schede",
    children: [
      {
        slug: "materia-prima",
        label: "Materia prima",
        description: "Schede materia prima",
        path: "/app/amministrazione/schede/materia-prima",
      },
      {
        slug: "servizi",
        label: "Servizi",
        description: "Catalogo servizi (targa Sz)",
        path: "/app/amministrazione/schede/servizi",
      },
      {
        slug: "prodotti",
        label: "Prodotti",
        description: "Catalogo prodotti fornitore (targa Pr)",
        path: "/app/amministrazione/schede/prodotti",
      },
      {
        slug: "prodotti-propri",
        label: "Prodotti Agrinsicilia",
        description: "Schede prodotti Agrinsicilia",
        path: "/app/amministrazione/schede/prodotti-propri",
      },
    ],
  },
  {
    slug: "ordini",
    label: "Ordini",
    description: "Gestione ordini ricevuti, evasi e storico",
    path: "/app/amministrazione/ordini",
    children: [
      {
        slug: "ricevuti",
        label: "Ricevuti",
        description: "Ordini ricevuti da gestire",
        path: "/app/amministrazione/ordini/ricevuti",
      },
      {
        slug: "evasi",
        label: "Evasi",
        description: "Ordini già evasi",
        path: "/app/amministrazione/ordini/evasi",
      },
      {
        slug: "storico",
        label: "Storico",
        description:
          "Ordini conclusi e consegnati; qui arriveranno anche dopo la chiusura automatica",
        path: "/app/amministrazione/ordini/storico",
      },
    ],
  },
  {
    slug: "fatture",
    label: "Fatture",
    description: "Fatture ricevute e inviate",
    path: "/app/amministrazione/fatture",
    children: [
      {
        slug: "ricevute",
        label: "Ricevute",
        description: "Fatture ricevute dai fornitori",
        path: "/app/amministrazione/fatture/ricevute",
      },
      {
        slug: "inviate",
        label: "Inviate",
        description: "Fatture inviate ai clienti",
        path: "/app/amministrazione/fatture/inviate",
      },
    ],
  },
  {
    slug: "grafici",
    label: "Statistiche",
    description:
      "Panoramica e report dell’anno in corso: produttività, ordini, materia prima, incassi",
    path: "/app/amministrazione/grafici",
    children: [
      {
        slug: "produttivita",
        label: "Produttività",
        description:
          "Quantità di prodotto finito generato (filtro prodotti propri)",
        path: "/app/amministrazione/grafici/produttivita",
      },
      {
        slug: "ordini",
        label: "Ordini",
        description:
          "Quantità ordinata (somma righe prodotto, non numero progressivo ordini)",
        path: "/app/amministrazione/grafici/ordini",
      },
      {
        slug: "materia-prima",
        label: "Materia prima",
        description:
          "Quantità di materia prima in ingresso (filtro per materia prima)",
        path: "/app/amministrazione/grafici/materia-prima",
      },
      {
        slug: "incassi",
        label: "Incassi",
        description:
          "Ordini pagati: importi per azienda, mese e anno",
        path: "/app/amministrazione/grafici/incassi",
      },
    ],
  },
  {
    slug: "dipendenti",
    label: "Dipendenti",
    description: "Personale, turni, ore e buste paga",
    path: "/app/amministrazione/dipendenti",
    children: [
      {
        slug: "elenco-e-mansione",
        label: "Elenco e mansione",
        description: "Elenco dipendenti e mansioni",
        path: "/app/amministrazione/dipendenti/elenco-e-mansione",
      },
      {
        slug: "turnistica",
        label: "Turnistica",
        description: "Turni del personale",
        path: "/app/amministrazione/dipendenti/turnistica",
      },
      {
        slug: "situazione-ore",
        label: "Situazione Ore",
        description: "Situazione ore lavorate",
        path: "/app/amministrazione/dipendenti/situazione-ore",
      },
      {
        slug: "buste-paga",
        label: "Buste paga",
        description: "Buste paga dipendenti",
        path: "/app/amministrazione/dipendenti/buste-paga",
      },
    ],
  },
] as const;

export function getFirstAmministrazionePath(): string {
  return firstNavLeafPath(AMMINISTRAZIONE_SECTIONS);
}

export function resolveAmministrazionePage(segments: string[]) {
  return resolveNavPage(AMMINISTRAZIONE_SECTIONS, segments);
}
