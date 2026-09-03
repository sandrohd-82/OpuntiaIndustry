import type { ListinoStato } from "@/types/database";

export type ListinoExportI18n = {
  filePrefix: string;
  scopeAll: string;
  scopeSel: string;
  productHead: [string, string, string];
  discountHead: [string, string, string, string, string, string];
  umKg: string;
  umLt: string;
  stato: Record<ListinoStato, string>;
  statusWord: string;
  versionWord: string;
  languageWord: string;
  exportedAt: string;
  scopeFull: string;
  scopeSelected: string;
  productsWord: string;
  discountsWord: string;
  bcp47: string;
};

const IT: ListinoExportI18n = {
  filePrefix: "listino",
  scopeAll: "completo",
  scopeSel: "selezione",
  productHead: ["Codice prodotto (Targa)", "Descrizione prodotto", "Prezzo"],
  discountHead: [
    "Codice Sconto (Targa)",
    "Qty da",
    "Qty a",
    "Tipo Conf.",
    "Conf. da",
    "% Sconto",
  ],
  umKg: "Kg",
  umLt: "Lt",
  stato: {
    bozza: "Bozza",
    in_revisione: "In Revisione",
    in_uso: "In Uso",
    obsoleto: "Obsoleto",
    bozza_traduzione: "Bozza traduzione",
  },
  statusWord: "stato",
  versionWord: "versione",
  languageWord: "lingua",
  exportedAt: "Esportato il {date} da {actor}",
  scopeFull: "listino completo",
  scopeSelected: "prodotti selezionati",
  productsWord: "prodotti",
  discountsWord: "sconti",
  bcp47: "it-IT",
};

const EN: ListinoExportI18n = {
  filePrefix: "pricelist",
  scopeAll: "full",
  scopeSel: "selection",
  productHead: ["Product code (SKU)", "Product description", "Price"],
  discountHead: [
    "Discount code (SKU)",
    "Qty from",
    "Qty to",
    "Pack type",
    "Pack from",
    "% Discount",
  ],
  umKg: "Kg",
  umLt: "Lt",
  stato: {
    bozza: "Draft",
    in_revisione: "In review",
    in_uso: "In use",
    obsoleto: "Obsolete",
    bozza_traduzione: "Translation draft",
  },
  statusWord: "status",
  versionWord: "version",
  languageWord: "language",
  exportedAt: "Exported on {date} by {actor}",
  scopeFull: "full price list",
  scopeSelected: "selected products",
  productsWord: "products",
  discountsWord: "discounts",
  bcp47: "en-GB",
};

const DE: ListinoExportI18n = {
  ...EN,
  filePrefix: "preisliste",
  scopeAll: "komplett",
  scopeSel: "auswahl",
  productHead: ["Artikelcode (SKU)", "Artikelbeschreibung", "Preis"],
  discountHead: [
    "Rabattcode (SKU)",
    "Menge von",
    "Menge bis",
    "Verpackungsart",
    "Gebinde ab",
    "% Rabatt",
  ],
  stato: {
    bozza: "Entwurf",
    in_revisione: "In Prüfung",
    in_uso: "In Gebrauch",
    obsoleto: "Veraltet",
    bozza_traduzione: "Übersetzungsentwurf",
  },
  statusWord: "Status",
  versionWord: "Version",
  languageWord: "Sprache",
  exportedAt: "Exportiert am {date} von {actor}",
  scopeFull: "vollständige Preisliste",
  scopeSelected: "ausgewählte Artikel",
  productsWord: "Artikel",
  discountsWord: "Rabatte",
  bcp47: "de-DE",
};

const FR: ListinoExportI18n = {
  ...EN,
  filePrefix: "liste_de_prix",
  scopeAll: "complet",
  scopeSel: "selection",
  productHead: ["Code produit (SKU)", "Description produit", "Prix"],
  discountHead: [
    "Code remise (SKU)",
    "Qté de",
    "Qté à",
    "Type d'emb.",
    "Emb. de",
    "% Remise",
  ],
  stato: {
    bozza: "Brouillon",
    in_revisione: "En révision",
    in_uso: "En vigueur",
    obsoleto: "Obsolète",
    bozza_traduzione: "Brouillon traduction",
  },
  statusWord: "état",
  versionWord: "version",
  languageWord: "langue",
  exportedAt: "Exporté le {date} par {actor}",
  scopeFull: "liste complète",
  scopeSelected: "produits sélectionnés",
  productsWord: "produits",
  discountsWord: "remises",
  bcp47: "fr-FR",
};

const ES: ListinoExportI18n = {
  ...EN,
  filePrefix: "lista_de_precios",
  scopeAll: "completo",
  scopeSel: "seleccion",
  productHead: ["Código producto (SKU)", "Descripción producto", "Precio"],
  discountHead: [
    "Código descuento (SKU)",
    "Cant. desde",
    "Cant. hasta",
    "Tipo de envase",
    "Envase desde",
    "% Descuento",
  ],
  stato: {
    bozza: "Borrador",
    in_revisione: "En revisión",
    in_uso: "En uso",
    obsoleto: "Obsoleto",
    bozza_traduzione: "Borrador traducción",
  },
  statusWord: "estado",
  versionWord: "versión",
  languageWord: "idioma",
  exportedAt: "Exportado el {date} por {actor}",
  scopeFull: "lista completa",
  scopeSelected: "productos seleccionados",
  productsWord: "productos",
  discountsWord: "descuentos",
  bcp47: "es-ES",
};

const PT: ListinoExportI18n = {
  ...EN,
  filePrefix: "lista_de_precos",
  scopeAll: "completo",
  scopeSel: "selecao",
  productHead: ["Código produto (SKU)", "Descrição produto", "Preço"],
  discountHead: [
    "Código desconto (SKU)",
    "Qtd de",
    "Qtd até",
    "Tipo de embalagem",
    "Emb. de",
    "% Desconto",
  ],
  stato: {
    bozza: "Rascunho",
    in_revisione: "Em revisão",
    in_uso: "Em uso",
    obsoleto: "Obsoleto",
    bozza_traduzione: "Rascunho tradução",
  },
  statusWord: "estado",
  versionWord: "versão",
  languageWord: "idioma",
  exportedAt: "Exportado em {date} por {actor}",
  scopeFull: "lista completa",
  scopeSelected: "produtos selecionados",
  productsWord: "produtos",
  discountsWord: "descontos",
  bcp47: "pt-PT",
};

const NL: ListinoExportI18n = {
  ...EN,
  filePrefix: "prijslijst",
  scopeAll: "volledig",
  scopeSel: "selectie",
  productHead: ["Productcode (SKU)", "Productomschrijving", "Prijs"],
  discountHead: [
    "Kortingscode (SKU)",
    "Aantal van",
    "Aantal tot",
    "Verpakkingstype",
    "Verp. van",
    "% Korting",
  ],
  stato: {
    bozza: "Concept",
    in_revisione: "In review",
    in_uso: "In gebruik",
    obsoleto: "Verouderd",
    bozza_traduzione: "Vertaalconcept",
  },
  statusWord: "status",
  versionWord: "versie",
  languageWord: "taal",
  exportedAt: "Geëxporteerd op {date} door {actor}",
  scopeFull: "volledige prijslijst",
  scopeSelected: "geselecteerde producten",
  productsWord: "producten",
  discountsWord: "kortingen",
  bcp47: "nl-NL",
};

const PL: ListinoExportI18n = {
  ...EN,
  filePrefix: "cennik",
  scopeAll: "pelny",
  scopeSel: "wybor",
  productHead: ["Kod produktu (SKU)", "Opis produktu", "Cena"],
  discountHead: [
    "Kod rabatu (SKU)",
    "Ilość od",
    "Ilość do",
    "Rodzaj opakowania",
    "Opak. od",
    "% Rabat",
  ],
  stato: {
    bozza: "Szkic",
    in_revisione: "W recenzji",
    in_uso: "W użyciu",
    obsoleto: "Przestarzały",
    bozza_traduzione: "Szkic tłumaczenia",
  },
  statusWord: "status",
  versionWord: "wersja",
  languageWord: "język",
  exportedAt: "Wyeksportowano {date} przez {actor}",
  scopeFull: "pełny cennik",
  scopeSelected: "wybrane produkty",
  productsWord: "produkty",
  discountsWord: "rabaty",
  bcp47: "pl-PL",
};

const RO: ListinoExportI18n = {
  ...EN,
  filePrefix: "lista_de_preturi",
  scopeAll: "complet",
  scopeSel: "selectie",
  productHead: ["Cod produs (SKU)", "Descriere produs", "Preț"],
  discountHead: [
    "Cod reducere (SKU)",
    "Cant. de la",
    "Cant. până la",
    "Tip ambalaj",
    "Amb. de la",
    "% Reducere",
  ],
  stato: {
    bozza: "Ciornă",
    in_revisione: "În revizuire",
    in_uso: "În uz",
    obsoleto: "Învechit",
    bozza_traduzione: "Ciornă traducere",
  },
  statusWord: "stare",
  versionWord: "versiune",
  languageWord: "limbă",
  exportedAt: "Exportat la {date} de {actor}",
  scopeFull: "listă completă",
  scopeSelected: "produse selectate",
  productsWord: "produse",
  discountsWord: "reduceri",
  bcp47: "ro-RO",
};

const BY_LOCALE: Record<string, ListinoExportI18n> = {
  it: IT,
  en: EN,
  de: DE,
  fr: FR,
  es: ES,
  pt: PT,
  nl: NL,
  pl: PL,
  ro: RO,
  cs: {
    ...EN,
    filePrefix: "cenik",
    productHead: ["Kód produktu (SKU)", "Popis produktu", "Cena"],
    discountHead: [
      "Kód slevy (SKU)",
      "Množ. od",
      "Množ. do",
      "Typ balení",
      "Bal. od",
      "% Sleva",
    ],
    bcp47: "cs-CZ",
  },
  hu: {
    ...EN,
    filePrefix: "arlista",
    productHead: ["Termékkód (SKU)", "Termékleírás", "Ár"],
    discountHead: [
      "Kedvezménykód (SKU)",
      "Menny. tól",
      "Menny. ig",
      "Csomagolás típusa",
      "Csom. tól",
      "% Kedvezmény",
    ],
    bcp47: "hu-HU",
  },
  el: {
    ...EN,
    filePrefix: "timokatalogos",
    productHead: ["Κωδικός προϊόντος (SKU)", "Περιγραφή προϊόντος", "Τιμή"],
    discountHead: [
      "Κωδικός έκπτωσης (SKU)",
      "Ποσ. από",
      "Ποσ. έως",
      "Τύπος συσκευασίας",
      "Συσκ. από",
      "% Έκπτωση",
    ],
    bcp47: "el-GR",
  },
  sv: {
    ...EN,
    filePrefix: "prislista",
    productHead: ["Produktkod (SKU)", "Produktbeskrivning", "Pris"],
    discountHead: [
      "Rabattkod (SKU)",
      "Antal från",
      "Antal till",
      "Förpackningstyp",
      "Förp. från",
      "% Rabatt",
    ],
    bcp47: "sv-SE",
  },
  da: {
    ...EN,
    filePrefix: "prisliste",
    productHead: ["Produktkode (SKU)", "Produktbeskrivelse", "Pris"],
    discountHead: [
      "Rabatkod (SKU)",
      "Antal fra",
      "Antal til",
      "Emballagetype",
      "Emb. fra",
      "% Rabat",
    ],
    bcp47: "da-DK",
  },
  fi: {
    ...EN,
    filePrefix: "hinnasto",
    productHead: ["Tuotekoodi (SKU)", "Tuotekuvaus", "Hinta"],
    discountHead: [
      "Alennuskoodi (SKU)",
      "Määrä alkaen",
      "Määrä asti",
      "Pakkauslaji",
      "Pak. alkaen",
      "% Alennus",
    ],
    bcp47: "fi-FI",
  },
  nb: {
    ...EN,
    filePrefix: "prisliste",
    productHead: ["Produktkode (SKU)", "Produktbeskrivelse", "Pris"],
    discountHead: [
      "Rabattkode (SKU)",
      "Antall fra",
      "Antall til",
      "Emballasjetype",
      "Emb. fra",
      "% Rabatt",
    ],
    bcp47: "nb-NO",
  },
};

export function listinoExportI18n(locale: string): ListinoExportI18n {
  const key = (locale || "it").trim().toLowerCase().slice(0, 2);
  if (key === "it") return IT;
  return BY_LOCALE[key] ?? EN;
}

export function listinoExportInfoLines(input: {
  locale: string;
  codice: string;
  statoLabel: string;
  versione: number;
  exportedAt: string;
  actor: string;
  scope: "tutti" | "selezione";
  prodottiCount: number;
  scontiCount: number;
}): string[] {
  const i = listinoExportI18n(input.locale);
  return [
    `${input.codice} · ${i.statusWord} ${input.statoLabel} · ${i.versionWord} V${input.versione} · ${i.languageWord} ${input.locale.toUpperCase()}`,
    i.exportedAt
      .replace("{date}", input.exportedAt)
      .replace("{actor}", input.actor),
    `${input.scope === "selezione" ? i.scopeSelected : i.scopeFull} · ${input.prodottiCount} ${i.productsWord} · ${input.scontiCount} ${i.discountsWord}`,
  ];
}
