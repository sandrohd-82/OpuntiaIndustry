import { OPUNTIA_ITALIA_NAV } from "@/lib/areas/web";
import {
  firstNavLeafPath,
  resolveNavPage,
  type NavItem,
} from "@/lib/areas/nav-tree";

/** Menu Amministrazione — struttura target OpuntiaIndustry */
export const AMMINISTRAZIONE_SECTIONS: readonly NavItem[] = [
  {
    slug: "clienti",
    label: "Elenco Clienti",
    description: "Clienti e possibili clienti",
    path: "/app/amministrazione/clienti",
    children: [
      {
        slug: "elenco",
        label: "Elenco Clienti",
        description: "Anagrafiche clienti attive",
        path: "/app/amministrazione/clienti/elenco",
      },
      {
        slug: "possibili",
        label: "Elenco Possibili clienti",
        description:
          "Contatti e nuove aziende da valutare (lead / prospect)",
        path: "/app/amministrazione/clienti/possibili",
      },
    ],
  },
  {
    slug: "fornitori",
    label: "Elenco Fornitori",
    description: "Fornitori bio, non bio e candidati",
    path: "/app/amministrazione/fornitori",
    children: [
      {
        slug: "bio",
        label: "Elenco Fornitori Bio",
        description: "Fornitori con certificazione / codice bio",
        path: "/app/amministrazione/fornitori/bio",
      },
      {
        slug: "elenco",
        label: "Elenco Fornitori",
        description: "Fornitori senza profilo bio",
        path: "/app/amministrazione/fornitori/elenco",
      },
      {
        slug: "possibili",
        label: "Elenco Possibili Fornitori",
        description: "Fornitori candidati in valutazione",
        path: "/app/amministrazione/fornitori/possibili",
      },
    ],
  },
  {
    slug: "rubrica",
    label: "Rubrica",
    description:
      "Referenti e contatti (dipendenti, aziende, timeline interazioni)",
    path: "/app/amministrazione/rubrica",
  },
  {
    slug: "schede",
    label: "Schede",
    description: "Cataloghi e schede di riferimento",
    path: "/app/amministrazione/schede",
    children: [
      {
        slug: "materia-prima",
        label: "Mp Materie Prime",
        description: "Schede materia prima",
        path: "/app/amministrazione/schede/materia-prima",
      },
      {
        slug: "servizi",
        label: "Sz Servizi",
        description: "Catalogo servizi (targa Sz)",
        path: "/app/amministrazione/schede/servizi",
      },
      {
        slug: "prodotti",
        label: "Pr Prodotti",
        description: "Catalogo prodotti fornitore (targa Pr)",
        path: "/app/amministrazione/schede/prodotti",
      },
      {
        slug: "prodotti-propri",
        label: "Prodotti Agrinsicilia",
        description: "Schede prodotti Agrinsicilia",
        path: "/app/amministrazione/schede/prodotti-propri",
      },
      {
        slug: "imballaggi-spedizioni",
        label: "Imballaggi e spedizioni",
        description:
          "Catalogo movimentazione, confezione, isolamento e corrieri",
        path: "/app/amministrazione/schede/imballaggi-spedizioni",
      },
      {
        slug: "listini-b2b",
        label: "Listini B2B",
        description:
          "Listini versionati per OpuntiaItalia (bozza / approvato / pubblicato)",
        path: "/app/amministrazione/schede/listini-b2b",
      },
      {
        slug: "canali-pubblicazione",
        label: "Canali pubblicazione",
        description:
          "Visibilità B2B / Wiki / B2C e stato pubblicazione prodotti",
        path: "/app/amministrazione/schede/canali-pubblicazione",
      },
    ],
  },
  {
    slug: "ordini",
    label: "Ordini",
    description: "Creazione, processi e storico ordini",
    path: "/app/amministrazione/ordini",
    children: [
      {
        slug: "crea-nuovo",
        label: "Crea nuovo",
        description: "Crea e gestisci nuovi ordini ricevuti",
        path: "/app/amministrazione/ordini/crea-nuovo",
      },
      {
        slug: "processati",
        label: "Processati",
        description:
          "Ordini/processi già registrati, programmati o in esecuzione",
        path: "/app/amministrazione/ordini/processati",
      },
      {
        slug: "storico",
        label: "Storico",
        description: "Ordini e processi già conclusi",
        path: "/app/amministrazione/ordini/storico",
      },
    ],
  },
  {
    slug: "statistiche",
    label: "Statistiche",
    description: "Dashboard e grafici amministrativi",
    path: "/app/amministrazione/statistiche",
    children: [
      {
        slug: "ordini",
        label: "Ordini",
        description:
          "Andamento ordini ricevuti e processati nel tempo",
        path: "/app/amministrazione/statistiche/ordini",
      },
      {
        slug: "economia",
        label: "Economia",
        description: "Incassi e andamento economico",
        path: "/app/amministrazione/statistiche/economia",
      },
      {
        slug: "produttivita",
        label: "Produttività",
        description:
          "Materiale lavorato e prodotti Agrinsicilia creati nel tempo",
        path: "/app/amministrazione/statistiche/produttivita",
      },
    ],
  },
  {
    slug: "organigramma",
    label: "Organigramma",
    description: "Persone, mansioni e struttura aziendale",
    path: "/app/amministrazione/organigramma",
    children: [
      {
        slug: "elenco-e-mansioni",
        label: "Elenco e mansioni",
        description:
          "Personale, mansioni, autorizzazioni e patenti",
        path: "/app/amministrazione/organigramma/elenco-e-mansioni",
      },
      {
        slug: "albero",
        label: "Albero",
        description: "Organigramma a cascata",
        path: "/app/amministrazione/organigramma/albero",
      },
    ],
  },
] as const;

export function getFirstAmministrazionePath(): string {
  return firstNavLeafPath(AMMINISTRAZIONE_SECTIONS);
}

export function resolveAmministrazionePage(segments: string[]) {
  return (
    resolveNavPage(AMMINISTRAZIONE_SECTIONS, segments) ??
    resolveNavPage([OPUNTIA_ITALIA_NAV], segments)
  );
}
