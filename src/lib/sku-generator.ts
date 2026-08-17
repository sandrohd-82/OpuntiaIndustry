/**
 * Generatore SKU parlante per articoli da fatture ricevute.
 * Struttura: [MACRO]-[TIPO]-[DETTAGLIO]-[FORMATO]
 * Ogni blocco tra "-" ha al massimo 3 caratteri alfanumerici.
 * Il dettaglio lungo resta nella descrizione/nome anagrafica.
 */

export type CatalogoAcquistoKind = "servizio" | "prodotto" | "materia";

export type SkuParts = {
  macro: string;
  tipo: string;
  dettaglio: string;
  formato: string;
};

export type SkuProposal = {
  /** Corpo senza prefisso catalogo (es. MIS-SOL-PH4-5DL). */
  body: string;
  /** SKU completo con prefisso (es. PrMIS-SOL-PH4-5DL). */
  codice: string;
  kind: CatalogoAcquistoKind;
  parts: SkuParts;
  /** Testo ripulito (stopword rimosse) usato per nome anagrafica. */
  nomeNormalizzato: string;
};

/** Lunghezza massima di ogni blocco MACRO / TIPO / DETTAGLIO / FORMATO. */
export const SKU_BLOCK_MAX_LEN = 3;

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
    // già coperte da MACRO/TIPO — evitano duplicati nel DETTAGLIO
    "soluzione",
    "soluzioni",
    "sol",
    "chimica",
    "chimico",
    "chimiche",
    "misura",
    "misurazione",
    "strumento",
    "strumenti",
    "strumentazione",
  ].map((w) => w.toLowerCase())
);

type MacroRule = {
  macro: string;
  tipo: string;
  patterns: RegExp[];
};

/**
 * Linea guida magazzino:
 * Macro: MIS (misura) | STR (strumentazione) | …
 * Tipo: SOL (soluzione) | STR (strumento) | …
 * Dettaglio: PH4, PH7, PUL, CNS, POT, …
 * Formato: compatto (500ml → 5DL)
 */
const MACRO_RULES: MacroRule[] = [
  {
    macro: "MIS",
    tipo: "SOL",
    patterns: [
      /\bsoluzion/i,
      /\breagente/i,
      /\btampone/i,
      /\bbuffer/i,
      /\bacido\b/i,
      /\bbase\b/i,
      /\bcalibr/i,
    ],
  },
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
      /\bprobe\b/i,
      /\belettrodo/i,
    ],
  },
  {
    macro: "STR",
    tipo: "PUL",
    patterns: [
      /\bpuliz/i,
      /\bdeterg/i,
      /\bsapon/i,
      /\bdisinfett/i,
      /\bsgrassat/i,
    ],
  },
  {
    macro: "STR",
    tipo: "IMB",
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
  /\b(\d+(?:[.,]\d+)?)\s*(ml|cl|dl|l|lt|kg|g|mg|mm|cm|m|mt|hz|v|w|kw|%)?\b/gi;

function stripDiacritics(value: string): string {
  return value.normalize("NFD").replace(/\p{M}/gu, "");
}

/** Normalizza un blocco SKU a max 3 caratteri A-Z0-9. */
export function clipSkuBlock(value: string, fallback = "X"): string {
  const cleaned = value.replace(/[^A-Za-z0-9]/g, "").toUpperCase();
  if (!cleaned) return fallback.slice(0, SKU_BLOCK_MAX_LEN);
  return cleaned.slice(0, SKU_BLOCK_MAX_LEN);
}

/** Token utili per SKU / nome (senza stopword ridondanti). */
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
      return {
        macro: clipSkuBlock(rule.macro, "GEN"),
        tipo: clipSkuBlock(rule.tipo, "ART"),
      };
    }
  }
  return { macro: "GEN", tipo: "ART" };
}

/**
 * Formato compatto (max 3):
 * 500 ml → 5DL, 1000 ml → 1L, 50 ml → 5CL, 250 ml → 25C (cl), …
 */
export function compactFormatoFromQuantity(
  amount: number,
  unitRaw: string
): string {
  if (!Number.isFinite(amount) || amount <= 0) return "STD";
  const unit = unitRaw.toLowerCase().replace("lt", "l").replace("mt", "m");

  const asMl =
    !unit || unit === "ml"
      ? amount
      : unit === "cl"
        ? amount * 10
        : unit === "dl"
          ? amount * 100
          : unit === "l"
            ? amount * 1000
            : null;

  if (asMl != null) {
    if (asMl >= 1000 && asMl % 1000 === 0) {
      return clipSkuBlock(`${asMl / 1000}L`, "1L");
    }
    if (asMl >= 100 && asMl % 100 === 0) {
      // 500 ml → 5DL (esattamente 3 caratteri)
      return clipSkuBlock(`${asMl / 100}DL`, "1DL");
    }
    if (asMl >= 10 && asMl % 10 === 0) {
      const cl = asMl / 10;
      // 5CL = 3; 25CL = 4 → 25C
      return clipSkuBlock(cl < 10 ? `${cl}CL` : `${cl}C`, "1CL");
    }
    return clipSkuBlock(`${Math.round(asMl)}M`, "STD");
  }

  if (unit === "kg") {
    return clipSkuBlock(`${Math.round(amount)}KG`, "KG");
  }

  if (unit === "g") {
    if (amount >= 1000 && amount % 1000 === 0) {
      return clipSkuBlock(`${amount / 1000}KG`, "KG");
    }
    return clipSkuBlock(`${Math.round(amount)}G`, "G");
  }

  if (unit === "mg") {
    return clipSkuBlock(`${Math.round(amount)}MG`, "MG");
  }

  return clipSkuBlock(`${Math.round(amount)}${unit}`, "STD");
}

function detectFormato(text: string): string {
  const matches = [...text.matchAll(FORMATO_RE)];
  if (matches.length === 0) return "STD";
  const last = matches[matches.length - 1];
  const num = Number((last[1] ?? "").replace(",", "."));
  const unit = last[2] ?? "ml";
  return compactFormatoFromQuantity(num, unit);
}

/** Dettaglio tipici: PH4, PH7, PUL, CNS, POT — max 3, senza ripetere MACRO/TIPO. */
function detectDettaglio(
  text: string,
  tokens: string[],
  macro: string,
  tipo: string
): string {
  const lower = text.toLowerCase();

  const phMatch =
    lower.match(/\bph\s*[:=]?\s*(\d(?:[.,]\d)?)\b/i) ||
    lower.match(/\bp\.?\s*h\.?\s*(\d(?:[.,]\d)?)\b/i);
  if (phMatch) {
    const n = phMatch[1].replace(",", "").replace(".", "");
    return clipSkuBlock(`PH${n}`, "PH");
  }

  if (/\bconserv/i.test(lower) || /\bstorag/i.test(lower)) {
    return "CNS";
  }
  if (/\bpuliz/i.test(lower) || /\bclean/i.test(lower)) {
    return "PUL";
  }
  if (/\b(orp|potenziometr|multimetr|temp(?:eratura)?)\b/i.test(lower)) {
    return "POT";
  }

  const skip = new Set(
    [macro, tipo, "std", "sol", "mis", "str", "pul", "cns", "pot"].map((s) =>
      s.toLowerCase()
    )
  );
  const candidates = tokens.filter((t) => {
    if (skip.has(t)) return false;
    if (/^\d/.test(t)) return false;
    if (
      /^(ml|cl|dl|l|lt|kg|g|mg|mm|cm|m|mt|hz|v|w|kw|nr|pcs?)$/i.test(t)
    ) {
      return false;
    }
    return true;
  });

  if (candidates.length === 0) return "GEN";
  return clipSkuBlock(candidates[0], "GEN");
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
  const dettaglio = detectDettaglio(text, tokens, macro, tipo);
  const formato = detectFormato(text);
  const parts = {
    macro: clipSkuBlock(macro, "GEN"),
    tipo: clipSkuBlock(tipo, "ART"),
    dettaglio: clipSkuBlock(dettaglio, "GEN"),
    formato: clipSkuBlock(formato, "STD"),
  };
  const body = [parts.macro, parts.tipo, parts.dettaglio, parts.formato].join(
    "-"
  );
  return { ...parts, body };
}

export function generateSkuProposal(
  invoiceLineText: string,
  kind?: CatalogoAcquistoKind
): SkuProposal {
  const resolvedKind = kind ?? suggestCatalogoKind(invoiceLineText);
  const { body, ...parts } = generateSkuBody(invoiceLineText);
  const prefix = catalogoKindPrefix(resolvedKind);
  return {
    body,
    codice: `${prefix}${body}`,
    kind: resolvedKind,
    parts,
    nomeNormalizzato:
      normalizeInvoiceLineText(invoiceLineText) ||
      invoiceLineText.trim() ||
      "Articolo",
  };
}
