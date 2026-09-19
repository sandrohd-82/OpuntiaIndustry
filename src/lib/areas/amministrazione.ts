import {
  CANALI_PUBBLICAZIONE_NAV,
  OPUNTIA_ITALIA_NAV,
} from "@/lib/areas/web";
import {
  firstNavLeafPath,
  resolveNavPage,
  type NavItem,
} from "@/lib/areas/nav-tree";

/** Menu Amministrazione — struttura target OpuntiaIndustry */
export const AMMINISTRAZIONE_SECTIONS: readonly NavItem[] = [
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
    ],
  },
  {
    slug: "da-processare",
    label: "Da processare",
    description:
      "Ordini inseriti da passare in produzione (solo Admin)",
    path: "/app/amministrazione/ordini/da-processare",
    adminOnly: true,
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
        slug: "provvigioni",
        label: "Provvigioni",
        description:
          "Incassi delle aziende collegate e provvigioni del commerciale",
        path: "/app/amministrazione/statistiche/provvigioni",
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
    description: "Operatori, mansioni e struttura aziendale",
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
      {
        slug: "presenze",
        label: "Presenze",
        description:
          "Timbrature ingresso/uscita da Fluida (Zucchetti)",
        path: "/app/amministrazione/organigramma/presenze",
      },
    ],
  },
  {
    slug: "documentazioni",
    label: "Documentazioni",
    description:
      "Documenti aziendali: In attesa, In carico e Scaduti da archiviare (solo Super Admin)",
    path: "/app/amministrazione/documentazioni",
    superAdminOnly: true,
  },
] as const;

export function getFirstAmministrazionePath(): string {
  return firstNavLeafPath(AMMINISTRAZIONE_SECTIONS);
}

export function resolveAmministrazionePage(segments: string[]) {
  const fromTree =
    resolveNavPage(AMMINISTRAZIONE_SECTIONS, segments) ??
    resolveNavPage([OPUNTIA_ITALIA_NAV], segments);
  if (fromTree) return fromTree;
  if (segments[0] === "ordini" && segments[1] === "da-processare") {
    return {
      label: "Da processare",
      description:
        "Ordini inseriti da passare in produzione (solo Admin)",
    };
  }
  if (
    segments[0] === "schede" &&
    segments[1] === "canali-pubblicazione"
  ) {
    return {
      label: CANALI_PUBBLICAZIONE_NAV.label,
      description: CANALI_PUBBLICAZIONE_NAV.description,
    };
  }
  return null;
}
