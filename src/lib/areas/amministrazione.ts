import {
  firstNavLeafPath,
  resolveNavPage,
  type NavItem,
} from "@/lib/areas/nav-tree";

/** Sottosezioni del modulo Amministrazione (menu laterale) */
export const AMMINISTRAZIONE_SECTIONS: readonly NavItem[] = [
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
    slug: "schede",
    label: "Schede",
    description: "Anagrafiche e schede di riferimento",
    path: "/app/amministrazione/schede",
    children: [
      {
        slug: "fornitori",
        label: "Fornitori",
        description: "Schede fornitori",
        path: "/app/amministrazione/schede/fornitori",
      },
      {
        slug: "materia-prima",
        label: "Materia prima",
        description: "Schede materia prima",
        path: "/app/amministrazione/schede/materia-prima",
      },
      {
        slug: "prodotti-propri",
        label: "Prodotti propri",
        description: "Schede prodotti propri",
        path: "/app/amministrazione/schede/prodotti-propri",
      },
      {
        slug: "clienti",
        label: "Clienti",
        description: "Schede clienti",
        path: "/app/amministrazione/schede/clienti",
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
  {
    slug: "grafici",
    label: "Grafici",
    description: "Grafici e report di amministrazione",
    path: "/app/amministrazione/grafici",
  },
] as const;

export function getFirstAmministrazionePath(): string {
  return firstNavLeafPath(AMMINISTRAZIONE_SECTIONS);
}

export function resolveAmministrazionePage(segments: string[]) {
  return resolveNavPage(AMMINISTRAZIONE_SECTIONS, segments);
}
