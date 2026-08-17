/**
 * Generatore SKU parlante per articoli da fatture ricevute.
 * Formato corpo: MACRO-TIPO-DETTAGLIO-FORMATO (poi prefisso Sz/Pr/Mp).
 * I codici alimentano ripristino magazzino e fogli ordine di riacquisto.
 */

export type CatalogoAcquistoKind = "servizio" | "prodotto" | "materia";

export type SkuParts = {
  macro: string;
  tipo: string;
  dettaglio: string;
  formato: string;
};

export type SkuProposal = {
  /** Corpo senza prefisso catalogo (es. MIS-SOL-PH04-500). */
  body: string;
  /** SKU completo con prefisso (es. PrMIS-SOL-PH04-500). */
  codice: string;
  kind: CatalogoAcquistoKind;
  parts: SkuParts;
  /** Testo ripulito (stopword rimosse) usato per nome anagrafica. */
  nomeNormalizzato: string;
};

const STOPWORDS = new Set(
  [
    "di",
    "da",
    "del",
    "della",
    "dei",
    "delle",
    "e",
    "ed",
    "o",
    "con",
    "per",
    "in",
    "a",
    "al",
    "alla",
    "lo",
    "la",
    "il",
    "un",
    "una",
    "uno",
    "the",
    "of",
    "and",
    "conf",
    "confezione",
    "confezioni",
    "imballo",
    "imballaggi",
    "scatola",
    "scatole",
    "cartone",
    "pacco",
    "pacchi",
    "pz",
    "pezzi",
    "pezzo",
    "n",
    "nr",
    "nro",
    "numero",
    "art",
    "articolo",
    "cod",
    "codice",
    "rif",
    "riferimento",
    "marca",
    "modello",
    "tipo",
    "var",
    "variante",
    "colore",
    "colori",
    "bianco",
    "nera",
    "nero",
    "rosso",
    "verde",
    "blu",
    "giallo",
    "grigio",
    "trasparente",
    "nuovo",
    "nuova",
    "usato",
    "usata",
  ].map((w) => w.toLowerCase())
);

type MacroRule = {
  macro: string;
  tipo?: string;
  patterns: RegExp[];
};

/** Macro/tipo da contesto magazzino/acquisto (estendibile). */
const MACRO_RULES: MacroRule[] = [
  {
    macro: "MIS",
    tipo: "STR",
    patterns: [
      /\bmisur/i,
      /\bmetro/i,
      /\bcalibro/i,
      /\bbilancia/i,
      /\btermometr/i,
      /\bph[\s\-]?metr/i,
      /\bsensore/i,
    ],
  },
  {
    macro: "SOL",
    tipo: "CHM",
    patterns: [
      /\bsoluzion/i,
      /\breagente/i,
      /\btampone/i,
      /\bbuffer/i,
      /\bacido/i,
      /\bbase\b/i,
    ],
  },
  {
    macro: "PUL",
    tipo: "DET",
    patterns: [
      /\bpuliz/i,
      /\bdeterg/i,
      /\bsapon/i,
      /\bdisinfett/i,
      /\bsgrassat/i,
      /\bcarta\s+igien/i,
    ],
  },
  {
    macro: "IMB",
    tipo: "PKG",
    patterns: [
      /\bimbust/i,
      /\bsacchet/i,
      /\bfilm\b/i,
      /\bnastro\b/i,
      /\betich/i,
      /\bpallett/i,
    ],
  },
  {
    macro: "STR",
    tipo: "ATT",
    patterns: [
      /\butensil/i,
      /\battrezz/i,
      /\butensile/i,
      /\bstrument/i,
      /\bapparecch/i,
      /\bmacchina/i,
    ],
  },
  {
    macro: "MPR",
    tipo: "RAW",
    patterns: [
      /\bfarina/i,
      /\bzuccher/i,
      /\bsale\b/i,
      /\bolio\b/i,
      /\bacqua\b/i,
      /\bingredient/i,
      /\bmateria\s+prima/i,
    ],
  },
  {
    macro: "SRV",
    tipo: "SVC",
    patterns: [
      /\bserviz/i,
      /\bmanutenz/i,
      /\bconsulenz/i,
      /\btrasport/i,
      /\bspedizion/i,
      /\bnoleggi/i,
    ],
  },
];

const FORMATO_RE =
  /\b(\d+(?:[.,]\d+)?)\s*(ml|l|lt|kg|g|mg|mm|cm|m|mt|hz|v|w|kw|%|pcs?|nr)?\b/gi;

function stripDiacritics(value: string): string {
  return value.normalize("NFD").replace(/\p{M}/gu, "");
}

/** Token utili per SKU (senza stopword/colori/imballi generici). */
export function tokenizeInvoiceLine(text: string): string[] {
  const raw = stripDiacritics(text)
    .toLowerCase()
    .replace(/[^a-z0-9\s.\-%/]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
  if (!raw) return [];
  return raw
    .split(" ")
    .map((t) => t.trim())
    .filter((t) => t.length >= 2 && !STOPWORDS.has(t));
}

export function normalizeInvoiceLineText(text: string): string {
  return tokenizeInvoiceLine(text).join(" ");
}

function detectMacroTipo(text: string): { macro: string; tipo: string } {
  for (const rule of MACRO_RULES) {
    if (rule.patterns.some((re) => re.test(text))) {
      return { macro: rule.macro, tipo: rule.tipo ?? "GEN" };
    }
  }
  return { macro: "GEN", tipo: "ART" };
}

function detectFormato(text: string): string {
  const matches = [...text.matchAll(FORMATO_RE)];
  if (matches.length === 0) return "STD";
  const last = matches[matches.length - 1];
  const num = (last[1] ?? "").replace(",", ".");
  const unit = (last[2] ?? "").toUpperCase().replace("LT", "L").replace("MT", "M");
  if (!num) return "STD";
  const compact = num.replace(/\.0+$/, "").replace(".", "");
  return `${compact}${unit || ""}`.slice(0, 8) || "STD";
}

function detectDettaglio(tokens: string[], macro: string, tipo: string): string {
  const skip = new Set(
    [macro, tipo, "std"].map((s) => s.toLowerCase())
  );
  const candidates = tokens.filter((t) => {
    if (skip.has(t)) return false;
    if (/^\d/.test(t)) return false;
    if (/^(ml|l|lt|kg|g|mg|mm|cm|m|mt|hz|v|w|kw|nr|pcs?)$/i.test(t)) return false;
    return true;
  });
  const pick = candidates.slice(0, 2).map((t) => t.slice(0, 4).toUpperCase());
  if (pick.length === 0) return "GEN";
  return pick.join("").slice(0, 8) || "GEN";
}

export function suggestCatalogoKind(text: string): CatalogoAcquistoKind {
  const lower = text.toLowerCase();
  if (MACRO_RULES.find((r) => r.macro === "SRV")?.patterns.some((re) => re.test(lower))) {
    return "servizio";
  }
  if (MACRO_RULES.find((r) => r.macro === "MPR")?.patterns.some((re) => re.test(lower))) {
    return "materia";
  }
  return "prodotto";
}

export function catalogoKindPrefix(kind: CatalogoAcquistoKind): "Sz" | "Pr" | "Mp" {
  if (kind === "servizio") return "Sz";
  if (kind === "materia") return "Mp";
  return "Pr";
}

/** Corpo SKU parlante (senza prefisso Sz/Pr/Mp). */
export function generateSkuBody(invoiceLineText: string): SkuParts & { body: string } {
  const text = invoiceLineText.trim() || "articolo";
  const tokens = tokenizeInvoiceLine(text);
  const { macro, tipo } = detectMacroTipo(text);
  const dettaglio = detectDettaglio(tokens, macro, tipo);
  const formato = detectFormato(text);
  const parts = { macro, tipo, dettaglio, formato };
  const body = [macro, tipo, dettaglio, formato]
    .map((p) => p.replace(/[^A-Za-z0-9]/g, "").toUpperCase() || "X")
    .join("-");
  return { ...parts, body };
}

export function generateSkuProposal(
  invoiceLineText: string,
  kind?: CatalogoAcquistoKind
): SkuProposal {
  const resolvedKind = kind ?? suggestCatalogoKind(invoiceLineText);
  const { body, ...parts } = generateSkuBody(invoiceLineText);
  const prefix = catalogoKindPrefix(resolvedKind);
  const safeBody = body.replace(/[^A-Za-z0-9\-_\/]/g, "");
  return {
    body: safeBody,
    codice: `${prefix}${safeBody}`,
    kind: resolvedKind,
    parts,
    nomeNormalizzato:
      normalizeInvoiceLineText(invoiceLineText) ||
      invoiceLineText.trim() ||
      "Articolo",
  };
}
