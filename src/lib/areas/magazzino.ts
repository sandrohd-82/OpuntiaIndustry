import {
  firstLeafPath,
  firstNavLeafPath,
  resolveNavPage,
  type NavItem,
} from "@/lib/areas/nav-tree";

export const MAGAZZINO_SECTIONS: readonly NavItem[] = [
  {
    slug: "materia-prima",
    label: "Materia Prima",
    description: "Ingressi, elenco, stato e non conformità Mp",
    path: "/app/magazzino/materia-prima",
    children: [
      {
        slug: "nuovo-ingresso",
        label: "Nuovo ingresso",
        description: "Registrazione nuovo ingresso di materia prima",
        path: "/app/magazzino/materia-prima/nuovo-ingresso",
      },
      {
        slug: "elenco",
        label: "Elenco",
        description: "Elenco e codici materia prima (schede Mp)",
        path: "/app/magazzino/materia-prima/elenco",
      },
      {
        slug: "stato",
        label: "Stato",
        description: "Stato della materia prima presente in azienda",
        path: "/app/magazzino/materia-prima/stato",
      },
      {
        slug: "storico",
        label: "Storico",
        description: "Storico materia prima transitata in azienda",
        path: "/app/magazzino/materia-prima/storico",
      },
      {
        slug: "scartati-non-conformi",
        label: "Scartati/Non conformi",
        description:
          "Storico e stato Mp non conforme o scarti di lavorazione",
        path: "/app/magazzino/materia-prima/scartati-non-conformi",
      },
    ],
  },
  {
    slug: "prodotti-di-consumo",
    label: "Prodotti di consumo",
    description: "Prodotti fornitore in magazzino (Pr)",
    path: "/app/magazzino/prodotti-di-consumo",
    children: [
      {
        slug: "registra-nuovo",
        label: "Registra Nuovo Prodotto",
        description: "Registrazione di un nuovo prodotto di consumo",
        path: "/app/magazzino/prodotti-di-consumo/registra-nuovo",
      },
      {
        slug: "inserisci",
        label: "Inserisci Prodotto",
        description: "Caricamento quantità in magazzino",
        path: "/app/magazzino/prodotti-di-consumo/inserisci",
      },
      {
        slug: "preleva",
        label: "Preleva Prodotto",
        description: "Registrazione prelievi dal magazzino",
        path: "/app/magazzino/prodotti-di-consumo/preleva",
      },
      {
        slug: "elenco",
        label: "Elenco prodotti",
        description: "Elenco prodotti di magazzino (schede Pr)",
        path: "/app/magazzino/prodotti-di-consumo/elenco",
      },
      {
        slug: "eliminati-obsoleti",
        label: "Eliminati/obsoleti",
        description: "Prodotti eliminati o dichiarati obsoleti",
        path: "/app/magazzino/prodotti-di-consumo/eliminati-obsoleti",
      },
    ],
  },
  {
    slug: "prodotti-agrinsicilia",
    label: "Prodotti Agrinsicilia",
    description: "Giacenze e movimenti prodotti propri",
    path: "/app/magazzino/prodotti-agrinsicilia",
    children: [
      {
        slug: "inserisci-quantita",
        label: "Inserisci Quantità",
        description: "Caricamento magazzino prodotti Agrinsicilia",
        path: "/app/magazzino/prodotti-agrinsicilia/inserisci-quantita",
      },
      {
        slug: "preleva-quantita",
        label: "Preleva Quantità",
        description: "Prelievo magazzino prodotti Agrinsicilia",
        path: "/app/magazzino/prodotti-agrinsicilia/preleva-quantita",
      },
      {
        slug: "elenco-e-quantita",
        label: "Elenco e Quantità Presenti",
        description: "Schede e quantità presenti in magazzino",
        path: "/app/magazzino/prodotti-agrinsicilia/elenco-e-quantita",
      },
      {
        slug: "scartati-non-conformi",
        label: "Scartati/Non conformi",
        description: "Prodotti non conformi o scarti",
        path: "/app/magazzino/prodotti-agrinsicilia/scartati-non-conformi",
      },
    ],
  },
  {
    slug: "note-di-acquisto",
    label: "Note di acquisto",
    description: "Note di acquisto magazzino",
    path: "/app/magazzino/note-di-acquisto",
    children: [
      {
        slug: "nuova",
        label: "Nuova nota",
        description: "Creazione nota di acquisto",
        path: "/app/magazzino/note-di-acquisto/nuova",
      },
      {
        slug: "aperte",
        label: "Note aperte",
        description: "Note di acquisto aperte",
        path: "/app/magazzino/note-di-acquisto/aperte",
        badge: { kind: "count", count: 0 },
      },
      {
        slug: "storico",
        label: "Storico",
        description: "Storico note di acquisto",
        path: "/app/magazzino/note-di-acquisto/storico",
      },
    ],
  },
] as const;

export function getFirstMagazzinoPath(): string {
  return firstNavLeafPath(MAGAZZINO_SECTIONS);
}

export function resolveMagazzinoPage(segments: string[]) {
  return resolveNavPage(MAGAZZINO_SECTIONS, segments);
}

export { firstLeafPath };
