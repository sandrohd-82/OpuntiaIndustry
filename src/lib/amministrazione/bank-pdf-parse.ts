import { createHash } from "crypto";
import { jsonrepair } from "jsonrepair";

export type ParsedBankLine = {
  transactionDate: string; // YYYY-MM-DD
  valutaDate: string | null;
  amount: number; // + entrata (AVERE), - uscita (DARE)
  description: string;
  counterpartyName: string;
  trnOrCro: string;
  /** Colonna estratto se nota dal layout (mai inventata dal segno). */
  column?: "DARE" | "AVERE" | null;
  /** Come è stato deciso il segno. */
  signSource?: string;
  /** Importo grezzo italiano dal PDF/AI (audit). */
  amountIt?: string;
};

export type ParseBankStatementResult = {
  text: string;
  lines: ParsedBankLine[];
  doubtful: Array<{
    description: string;
    aiAmount: number;
    reason: string;
  }>;
  parserModel: string;
  notes: string;
};

const DATE_RE = /\d{1,2}[\/\-.]\d{1,2}[\/\-.]\d{2,4}/g;

/**
 * Token importo IT: migliaia con `.`, decimali con `,` (obbligatori 2 cifre).
 * Non cattura date né percentuali; limite cifra intera per evitare glue PDF.
 */
export const IT_AMOUNT_RE =
  /(?<![\d.,])(?:\d{1,3}(?:\.\d{3})+|\d{1,7}),\d{2}(?![\d,])/g;

const MAX_PLAUSIBLE_AMOUNT = Number(
  process.env.BANK_IMPORT_MAX_AMOUNT ?? 500_000
);

/**
 * Parsing importi italiani.
 * - `1.234,56` → 1234.56
 * - `25,28` → 25.28
 * - `25.280` senza virgola: AMBIGUO → null in strict (evita 25,28→25280)
 */
export function parseItAmount(
  raw: string,
  opts?: { strict?: boolean }
): number | null {
  const s0 = String(raw ?? "")
    .replace(/\u00A0/g, " ")
    .trim();
  if (!s0) return null;
  const neg = /^-|-$|^\(/.test(s0) || /^-/.test(s0.replace(/\s/g, ""));
  const s = s0
    .replace(/\s/g, "")
    .replace(/€|EUR/gi, "")
    .replace(/^[+\-(]+/, "")
    .replace(/[)\-]+$/, "");
  if (!s) return null;

  // Formato IT classico con decimali
  if (/^\d{1,3}(?:\.\d{3})*,\d{1,2}$/.test(s) || /^\d+,\d{1,2}$/.test(s)) {
    const n = Number(s.replace(/\./g, "").replace(",", "."));
    if (!Number.isFinite(n)) return null;
    return neg ? -Math.abs(n) : n;
  }

  // Solo intero
  if (/^\d+$/.test(s)) {
    const n = Number(s);
    if (!Number.isFinite(n)) return null;
    return neg ? -Math.abs(n) : n;
  }

  // Solo punti: tipo 25.280 — in IT = migliaia, ma confondibile con 25.28 EN.
  // In strict (input AI) NON indovinare.
  if (/^\d{1,3}(?:\.\d{3})+$/.test(s)) {
    if (opts?.strict) return null;
    const n = Number(s.replace(/\./g, ""));
    if (!Number.isFinite(n)) return null;
    return neg ? -Math.abs(n) : n;
  }

  // Punto come decimale US (es. 25.28) — solo se esattamente 1–2 decimali e non migliaia
  if (/^\d+\.\d{1,2}$/.test(s) && !/^\d{1,3}(?:\.\d{3})+/.test(s)) {
    const n = Number(s);
    if (!Number.isFinite(n)) return null;
    return neg ? -Math.abs(n) : n;
  }

  return null;
}

/**
 * Causali ENTRATA (tie-breaker). "Bonifico a vs favore" e "Storno" sono forzatamente +.
 */
const AVERE_CAUSAL_RE =
  /\bstorno\b|bonifico\s+a\s+v\.?\s*s\.?\s+favore|bonifico\s+a\s+vs\.?\s+favore|bonifico\s+a\s+vostro\s+favore|a\s+vs\.?\s+favore|a\s+vostro\s+favore|\bbonifico\s+(?:da|ricevuto)\b|\bgiroconto\s+in\s+entrata\b|\b(?:accredit\w*)\b|\bincassi?\b(?!\s+(?:sdd|rid|commiss))/i;

/** Causali tipiche USCITA. */
const DARE_CAUSAL_RE =
  /\b(?:pagament\w*|addebit\w*|preliev\w*|canon\w*|commission\w*|\brid\b|\bsdd\b|\bmav\b|\brav\b|\bf24\b|bollettin\w*|utenz\w*|delega)\b|\bbonifico\s+(?:a|verso)\b(?!\s+v\.?\s*s|\s+vs|\s+vostro)|\bsepa\s*direct\b|\bassegno\s+emesso\b|\bgiroconto\s+in\s+uscita\b|\bversamento\s+unitario\b/i;

/** Sempre − (anche se colonna/AI dicono altrimenti). */
const FORCE_NEGATIVE_RE = /\binteressi\b/i;

/** Sempre + senza dubbio. */
const FORCE_POSITIVE_RE =
  /\bstorno\b|bonifico\s+a\s+v\.?\s*s\.?\s+favore|bonifico\s+a\s+vs\.?\s+favore|bonifico\s+a\s+vostro\s+favore|a\s+vs\.?\s+favore|a\s+vostro\s+favore/i;

export function isAvereCausal(text: string): boolean {
  return AVERE_CAUSAL_RE.test(text);
}

export function isDareCausal(text: string): boolean {
  return DARE_CAUSAL_RE.test(text);
}

export function isForcePositiveCausal(text: string): boolean {
  return FORCE_POSITIVE_RE.test(text);
}

export function isForceNegativeCausal(text: string): boolean {
  return FORCE_NEGATIVE_RE.test(text);
}

/**
 * Regole segno:
 * 1) Interessi → sempre −
 * 2) "Bonifico a vs favore" / "Storno" → sempre + (niente dubbio)
 * 3) Colonna PDF uscita/entrata
 * 4) Altre causali / default DARE (−)
 */
export function applySignRules(input: {
  description: string;
  amount: number;
  column?: "DARE" | "AVERE" | null;
}): {
  amount: number;
  signSource: string;
  doubtful: boolean;
  reason?: string;
} {
  const mag = Math.abs(input.amount);
  if (!Number.isFinite(mag) || mag === 0) {
    return {
      amount: 0,
      signSource: "skip-zero",
      doubtful: true,
      reason: "importo zero",
    };
  }

  const text = input.description;
  const col = input.column ?? null;

  // Regole forzate da descrizione (priorità massima, nessun dubbio)
  if (isForceNegativeCausal(text)) {
    return { amount: -mag, signSource: "force-interessi", doubtful: false };
  }
  if (isForcePositiveCausal(text)) {
    return {
      amount: mag,
      signSource: /\bstorno\b/i.test(text)
        ? "force-storno"
        : "force-bonifico-vs-favore",
      doubtful: false,
    };
  }

  const avereCausal = isAvereCausal(text);
  const dareCausal = isDareCausal(text);

  if (col === "DARE") {
    return { amount: -mag, signSource: "column-dare", doubtful: false };
  }
  if (col === "AVERE") {
    return { amount: mag, signSource: "column-avere", doubtful: false };
  }

  if (avereCausal && dareCausal) {
    return {
      amount: -mag,
      signSource: "ambiguous",
      doubtful: true,
      reason: "Causale ambigua (entrata + uscita) — escluso",
    };
  }
  if (avereCausal) {
    return { amount: mag, signSource: "causal-avere", doubtful: false };
  }
  if (dareCausal) {
    return { amount: -mag, signSource: "causal-dare", doubtful: false };
  }

  return {
    amount: -mag,
    signSource:
      input.amount > 0 ? "default-dare-corrected" : "default-dare",
    doubtful: false,
  };
}

function toIsoFromIt(d: string): string | null {
  const m = d.trim().match(/^(\d{1,2})[\/\-.](\d{1,2})[\/\-.](\d{2,4})$/);
  if (!m) return null;
  const dd = Number(m[1]);
  const mm = Number(m[2]);
  let yyyy = Number(m[3]);
  if (yyyy < 100) yyyy += 2000;
  if (mm < 1 || mm > 12 || dd < 1 || dd > 31) return null;
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${yyyy}-${pad(mm)}-${pad(dd)}`;
}

function lineHash(line: ParsedBankLine): string {
  const base = [
    line.transactionDate,
    line.valutaDate ?? "",
    line.amount.toFixed(2),
    line.description.slice(0, 120).toLowerCase(),
    line.trnOrCro,
  ].join("|");
  return createHash("sha256").update(base).digest("hex").slice(0, 40);
}

export function hashBankLine(line: ParsedBankLine): string {
  return lineHash(line);
}

export async function extractPdfText(buffer: Buffer): Promise<string> {
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const pdfParse = require("pdf-parse") as (
    data: Buffer
  ) => Promise<{ text: string }>;
  const parsed = await pdfParse(buffer);
  return String(parsed.text || "").replace(/\r/g, "");
}

function extractDates(line: string): string[] {
  return [...line.matchAll(DATE_RE)].map((m) => m[0]);
}

export function extractItAmounts(line: string): string[] {
  const cleaned = line
    .replace(DATE_RE, " ")
    .replace(/\d+(?:[.,]\d+)?\s*%/g, " ");
  return [...cleaned.matchAll(IT_AMOUNT_RE)].map((m) => m[0]);
}

function isNoiseLine(line: string): boolean {
  return /^(saldo|totale|totali|pagina|estratto|iban|abi|cab|mov\.?\s*dare|mov\.?\s*avere|data\s*valuta|data\s*contabile|riepilogo|segue)\b/i.test(
    line
  ) || /\b(saldo|totale|totali|riepilogo)\b/i.test(line);
}

/**
 * Una riga = un movimento. Ultimo importo spesso è SALDO → non trattarlo come AVERE.
 */
function resolveDareAvereAmounts(
  line: string,
  amountTokens: string[]
): Array<{ amount: number; column: "DARE" | "AVERE" | null; amountIt: string }> {
  const lower = line.toLowerCase().replace(/\s+/g, " ");
  const hasLayout =
    /mov\.?\s*dare/.test(lower) && /mov\.?\s*avere/.test(lower);
  const hasSaldoWord = /\bsaldo\b/.test(lower);

  let tokens = [...amountTokens];
  if (hasSaldoWord && tokens.length > 1) {
    tokens = tokens.slice(0, -1);
  }
  // Tipico: data + dare + avere + saldo → 3 importi; scarta l'ultimo (saldo)
  if (!hasLayout && tokens.length >= 3) {
    tokens = tokens.slice(0, -1);
  }

  const out: Array<{
    amount: number;
    column: "DARE" | "AVERE" | null;
    amountIt: string;
  }> = [];

  if (tokens.length >= 2 && hasLayout) {
    const dareRaw = tokens[tokens.length - 2];
    const avereRaw = tokens[tokens.length - 1];
    const dare = parseItAmount(dareRaw);
    const avere = parseItAmount(avereRaw);
    if (dare != null && dare !== 0) {
      out.push({
        amount: -Math.abs(dare),
        column: "DARE",
        amountIt: dareRaw,
      });
    }
    if (avere != null && avere !== 0) {
      out.push({
        amount: Math.abs(avere),
        column: "AVERE",
        amountIt: avereRaw,
      });
    }
    return out;
  }

  // Due importi senza header esplicito: primo=movimento, secondo=saldo → solo il primo
  if (tokens.length >= 2) {
    tokens = [tokens[0]];
  }

  if (tokens.length === 1) {
    const raw = tokens[0];
    const abs = parseItAmount(raw);
    if (abs == null || abs === 0) return [];
    const colOnLine = /mov\.?\s*avere/i.test(lower)
      ? ("AVERE" as const)
      : /mov\.?\s*dare/i.test(lower)
        ? ("DARE" as const)
        : null;
    const signed = applySignRules({
      description: line,
      amount: Math.abs(abs),
      column: colOnLine,
    });
    if (!signed.doubtful && signed.amount !== 0) {
      out.push({
        amount: signed.amount,
        column: colOnLine,
        amountIt: raw,
      });
    }
  }

  return out;
}

export function parseBankStatementHeuristic(text: string): ParsedBankLine[] {
  const lines = text
    .split("\n")
    .map((l) => l.replace(/\s+/g, " ").trim())
    .filter(Boolean);

  const out: ParsedBankLine[] = [];

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    if (isNoiseLine(line)) continue;

    const dates = extractDates(line);
    const amountTokens = extractItAmounts(line);
    if (!dates.length || !amountTokens.length) continue;

    const txDate = toIsoFromIt(dates[0]);
    if (!txDate) continue;
    const valutaDate = dates[1] ? toIsoFromIt(dates[1]) : txDate;

    const signedAmounts = resolveDareAvereAmounts(line, amountTokens);
    if (!signedAmounts.length) continue;

    let description = line
      .replace(DATE_RE, " ")
      .replace(IT_AMOUNT_RE, " ")
      .replace(/mov\.?\s*dare|mov\.?\s*avere/gi, " ")
      .replace(/\s+/g, " ")
      .trim();
    if (description.length < 3 && lines[i + 1]) {
      const next = lines[i + 1];
      if (!extractDates(next).length || extractItAmounts(next).length === 0) {
        if (!isNoiseLine(next)) {
          description = `${description} ${next}`.trim();
        }
      }
    }

    const trn =
      line.match(/\b(?:TRN|CRO|CUP|ID)[:\s]*([A-Z0-9]+)/i)?.[1] || "";

    for (const row of signedAmounts) {
      out.push({
        transactionDate: txDate,
        valutaDate,
        amount: row.amount,
        description:
          description ||
          (row.amount < 0 ? "Mov.DARE (uscita)" : "Mov.AVERE (entrata)"),
        counterpartyName: "",
        trnOrCro: trn,
        column: row.column,
        signSource: "heuristic",
        amountIt: row.amountIt,
      });
    }
  }

  const seen = new Set<string>();
  return out.filter((l) => {
    const h = lineHash(l);
    if (seen.has(h)) return false;
    seen.add(h);
    return true;
  });
}

export function normalizeAiColumn(raw: unknown): "DARE" | "AVERE" | null {
  const s = String(raw ?? "")
    .trim()
    .toUpperCase();
  if (!s) return null;
  if (/AVERE|CREDIT|ENTRAT|^\+$|^C$/.test(s)) return "AVERE";
  if (/DARE|DEBIT|USCIT|ADDEBIT|^-$|^D$/.test(s)) return "DARE";
  return null;
}

/**
 * Priorità: dareIt/avereIt → amountCents (intero JSON) → amountIt stringa → amount.
 */
function resolveAiAmount(r: Record<string, unknown>): {
  amount: number;
  column: "DARE" | "AVERE" | null;
  amountIt: string;
} | null {
  const col = normalizeAiColumn(r.column);

  const dareIt = r.dareIt != null ? String(r.dareIt).trim() : "";
  const avereIt = r.avereIt != null ? String(r.avereIt).trim() : "";
  if (dareIt && parseItAmount(dareIt, { strict: true }) != null) {
    const n = parseItAmount(dareIt, { strict: true })!;
    if (n !== 0) {
      return { amount: -Math.abs(n), column: "DARE", amountIt: dareIt };
    }
  }
  if (avereIt && parseItAmount(avereIt, { strict: true }) != null) {
    const n = parseItAmount(avereIt, { strict: true })!;
    if (n !== 0) {
      return { amount: Math.abs(n), column: "AVERE", amountIt: avereIt };
    }
  }

  // amountCents = centesimi interi (25,28 € → 2528) — formato JSON-safe
  const centsRaw = r.amountCents ?? r.cents;
  if (centsRaw != null && centsRaw !== "") {
    const cents = Number(centsRaw);
    if (Number.isFinite(cents) && Number.isInteger(cents) && cents !== 0) {
      const mag = Math.abs(cents) / 100;
      const fromIt = String(r.amountIt ?? "").trim();
      const amountIt =
        fromIt && parseItAmount(fromIt, { strict: true }) != null
          ? fromIt
          : mag.toFixed(2).replace(".", ",");
      const signed = col === "AVERE" ? mag : -mag;
      return { amount: signed, column: col, amountIt };
    }
  }

  const amountIt = String(r.amountIt ?? r.importoIt ?? "").trim();
  if (amountIt) {
    const n = parseItAmount(amountIt, { strict: true });
    if (n == null || n === 0) return null;
    return {
      amount: Math.abs(n) * (col === "AVERE" ? 1 : -1),
      column: col,
      amountIt,
    };
  }

  // Fallback numerico: solo se intero/decimale chiaro, mai "25.280" ambigua
  const rawAmount = r.amount;
  if (typeof rawAmount === "string") {
    const n = parseItAmount(rawAmount, { strict: true });
    if (n == null || n === 0) return null;
    const signed =
      col === "AVERE"
        ? Math.abs(n)
        : col === "DARE"
          ? -Math.abs(n)
          : -Math.abs(n);
    return { amount: signed, column: col, amountIt: rawAmount };
  }
  if (typeof rawAmount === "number" && Number.isFinite(rawAmount)) {
    const mag = Math.abs(rawAmount);
    if (mag === 0) return null;
    // Sospetto: interi tondi grandi senza amountIt/cents (possibile ×1000)
    if (
      mag >= 1000 &&
      Number.isInteger(mag) &&
      mag % 1000 === 0 &&
      !r.amountIt &&
      !r.amountCents
    ) {
      return null;
    }
    const signed = col === "AVERE" ? mag : -mag;
    return {
      amount: signed,
      column: col,
      amountIt: mag.toFixed(2).replace(".", ","),
    };
  }

  return null;
}

export type AiParseResult =
  | { ok: true; lines: ParsedBankLine[]; modelName: string }
  | { ok: false; error: string };

/**
 * Ripara JSON tipico LLM su estratti IT (prima di jsonrepair).
 */
export function repairBankAiJson(raw: string): string {
  let s = String(raw ?? "").trim();
  s = s.replace(/^```(?:json)?\s*/i, "").replace(/\s*```$/i, "");
  const start = s.indexOf("{");
  const end = s.lastIndexOf("}");
  // Se tronca a metà, tieni dall'inizio { fino alla fine disponibile
  if (start >= 0) {
    s = end > start ? s.slice(start, end + 1) : s.slice(start);
  }

  // amountIt/dareIt/avereIt con virgola IT non quotata
  s = s.replace(
    /("(amountIt|dareIt|avereIt|importoIt)"\s*:\s*)(-?\d{1,3}(?:\.\d{3})*,\d{1,2}|-?\d+,\d{1,2})(?=\s*[,}\]])/g,
    '$1"$3"'
  );
  s = s.replace(
    /("amount"\s*:\s*)(-?\d{1,3}(?:\.\d{3})*,\d{1,2}|-?\d+,\d{1,2})(?=\s*[,}\]])/g,
    '$1"$2"'
  );
  // Newline letterali dentro stringhe (rompe spesso JSON)
  s = s.replace(/,\s*([}\]])/g, "$1");
  return s;
}

export function parseBankAiJson(content: string): { lines?: unknown[] } {
  const candidates = [
    content,
    repairBankAiJson(content),
    (() => {
      try {
        return jsonrepair(content);
      } catch {
        return "";
      }
    })(),
    (() => {
      try {
        return jsonrepair(repairBankAiJson(content));
      } catch {
        return "";
      }
    })(),
  ].filter(Boolean);

  let lastErr: unknown;
  for (const attempt of candidates) {
    try {
      return JSON.parse(attempt) as { lines?: unknown[] };
    } catch (e) {
      lastErr = e;
    }
  }
  throw lastErr instanceof Error ? lastErr : new Error("JSON non valido");
}

const BANK_AI_SYSTEM = `Sei un estrattore CONTABILE di un estratto conto bancario italiano.
Il documento è una TABELLA a 5 COLONNE fisse, in quest'ordine:

1) Data esecuzione (data contabile / operazione)
2) Data valuta
3) Importi in USCITA → segno NEGATIVO (−). Vuoto se la riga è un'entrata.
4) Importi in ENTRATA → segno POSITIVO (+). Vuoto se la riga è un'uscita.
5) Descrizione / causale

REGOLA COLONNE 3/4: si ALTERNANO.
- Se colonna 3 (uscita) ha importo → colonna 4 VUOTA → uscitaCents valorizzato, entrataCents=null.
- Se colonna 4 (entrata) ha importo → colonna 3 VUOTA → entrataCents valorizzato, uscitaCents=null.
- Mai entrambe valorizzate. Mai inventare l'altra colonna.

REGOLE SEGNO OBBLIGATORIE (niente dubbio):
6) Descrizione con "Bonifico a vs favore" / "Bonifico a vs. favore" / "Bonifico a vs favore" → SEMPRE entrata (+): usa entrataCents (mai uscitaCents).
7) Descrizione con la parola "Storno" → SEMPRE entrata (+): usa entrataCents.
8) Descrizione con la parola "Interessi" → SEMPRE uscita (−): usa uscitaCents.

Formato importi PDF: italiano (1.234,56). Tu restituisci centesimi INTERI JSON (25,28 → 2528). MAI virgole nei numeri JSON.

Rispondi SOLO JSON valido:
{"lines":[{
  "transactionDate":"YYYY-MM-DD",
  "valutaDate":"YYYY-MM-DD o null",
  "uscitaCents":null,
  "entrataCents":2528,
  "description":"causale senza a capo",
  "counterpartyName":"",
  "trnOrCro":""
}]}

- Per ogni riga: valorizza SOLO uno tra uscitaCents e entrataCents (l'altro null), rispettando le regole 6–8.
- Ignora saldi, totali, intestazioni, piè di pagina.
- Se non trovi movimenti: {"lines":[]}`;

function mapAiRowsToLines(rows: unknown[]): ParsedBankLine[] {
  const lines: ParsedBankLine[] = [];
  for (const row of rows) {
    if (!row || typeof row !== "object") continue;
    const r = row as Record<string, unknown>;
    const transactionDate = String(r.transactionDate ?? "").slice(0, 10);
    if (!/^\d{4}-\d{2}-\d{2}$/.test(transactionDate)) continue;

    const valutaRaw =
      r.valutaDate == null ? null : String(r.valutaDate).slice(0, 10);
    const valutaDate =
      valutaRaw && /^\d{4}-\d{2}-\d{2}$/.test(valutaRaw) ? valutaRaw : null;
    const description =
      String(r.description ?? "")
        .replace(/[\r\n]+/g, " ")
        .trim() || "Movimento PDF";
    const counterpartyName = String(r.counterpartyName ?? "").trim();
    const trnOrCro = String(r.trnOrCro ?? "").trim();

    const pushFromCents = (
      centsRaw: unknown,
      column: "DARE" | "AVERE",
      signSource: string
    ) => {
      if (centsRaw == null || centsRaw === "") return;
      const cents = Number(centsRaw);
      if (!Number.isFinite(cents) || !Number.isInteger(cents) || cents === 0) {
        return;
      }
      const mag = Math.abs(cents) / 100;
      lines.push({
        transactionDate,
        valutaDate,
        amount: column === "AVERE" ? mag : -mag,
        description,
        counterpartyName,
        trnOrCro,
        column,
        signSource,
        amountIt: mag.toFixed(2).replace(".", ","),
      });
    };

    // Schema 5 colonne: uscitaCents / entrataCents (mutuamente esclusivi)
    const hasUscita = r.uscitaCents != null && r.uscitaCents !== "";
    const hasEntrata = r.entrataCents != null && r.entrataCents !== "";
    if (hasUscita || hasEntrata) {
      if (hasUscita && hasEntrata) {
        // Ambiguità: preferisci quella non zero; se entrambe, escludi (validateLines non vede questo)
        // Prendi solo uscita se entrambe (conservativo) — meglio non inventare entrate
        pushFromCents(r.uscitaCents, "DARE", "openai-uscitaCents");
        continue;
      }
      if (hasUscita) {
        pushFromCents(r.uscitaCents, "DARE", "openai-uscitaCents");
      }
      if (hasEntrata) {
        pushFromCents(r.entrataCents, "AVERE", "openai-entrataCents");
      }
      continue;
    }

    const dareIt = r.dareIt != null ? String(r.dareIt).trim() : "";
    const avereIt = r.avereIt != null ? String(r.avereIt).trim() : "";
    if (dareIt || avereIt) {
      if (dareIt) {
        const n = parseItAmount(dareIt, { strict: true });
        if (n != null && n !== 0) {
          lines.push({
            transactionDate,
            valutaDate,
            amount: -Math.abs(n),
            description,
            counterpartyName,
            trnOrCro,
            column: "DARE",
            signSource: "openai-dareIt",
            amountIt: dareIt,
          });
        }
      }
      if (avereIt) {
        const n = parseItAmount(avereIt, { strict: true });
        if (n != null && n !== 0) {
          lines.push({
            transactionDate,
            valutaDate,
            amount: Math.abs(n),
            description,
            counterpartyName,
            trnOrCro,
            column: "AVERE",
            signSource: "openai-avereIt",
            amountIt: avereIt,
          });
        }
      }
      continue;
    }

    // Retrocompat amountCents + column
    const resolved = resolveAiAmount(r);
    if (!resolved) continue;

    lines.push({
      transactionDate,
      valutaDate,
      amount: resolved.amount,
      description,
      counterpartyName,
      trnOrCro,
      column: resolved.column,
      signSource: resolved.column ? "openai-column" : "openai-nocolumn",
      amountIt: resolved.amountIt,
    });
  }
  return lines;
}

function chunkPdfText(text: string, chunkSize = 7000): string[] {
  const clean = text.replace(/\r/g, "");
  if (clean.length <= chunkSize) return [clean];
  const parts: string[] = [];
  let i = 0;
  while (i < clean.length) {
    let end = Math.min(i + chunkSize, clean.length);
    if (end < clean.length) {
      const nl = clean.lastIndexOf("\n", end);
      if (nl > i + chunkSize * 0.5) end = nl;
    }
    const slice = clean.slice(i, end).trim();
    if (slice) parts.push(slice);
    i = end;
  }
  return parts.length ? parts : [clean.slice(0, chunkSize)];
}

async function callOpenAiBankChunk(input: {
  apiKey: string;
  model: string;
  chunk: string;
  chunkIndex: number;
  chunkTotal: number;
  isTable?: boolean;
}): Promise<{ lines: ParsedBankLine[]; rawError?: string }> {
  const intro = input.isTable
    ? `Parte ${input.chunkIndex + 1}/${input.chunkTotal}. TABELLA 5 colonne: (1) data esecuzione (2) data valuta (3) USCITA − (4) ENTRATA + (5) descrizione. 3 e 4 si alternano. FORZA +: "Bonifico a vs favore", "Storno". FORZA −: "Interessi". Restituisci uscitaCents OPPURE entrataCents.`
    : `Parte ${input.chunkIndex + 1}/${input.chunkTotal}. Estratto 5 colonne. 3/4 alternate. FORZA +: Bonifico a vs favore, Storno. FORZA −: Interessi. uscitaCents OPPURE entrataCents.`;

  const res = await fetch("https://api.openai.com/v1/chat/completions", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${input.apiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      model: input.model,
      temperature: 0,
      response_format: { type: "json_object" },
      messages: [
        { role: "system", content: BANK_AI_SYSTEM },
        {
          role: "user",
          content: `${intro}\n\n${input.chunk}`,
        },
      ],
    }),
  });
  if (!res.ok) {
    const body = await res.text().catch(() => "");
    return {
      lines: [],
      rawError: `HTTP ${res.status}: ${body.slice(0, 160)}`,
    };
  }
  const json = (await res.json()) as {
    choices?: Array<{ message?: { content?: string } }>;
  };
  const content = json.choices?.[0]?.message?.content;
  if (!content) return { lines: [], rawError: "risposta vuota" };

  try {
    const parsed = parseBankAiJson(content);
    return { lines: mapAiRowsToLines(parsed.lines ?? []) };
  } catch (e) {
    console.error(
      "[bank-pdf-ai-json]",
      e,
      "snippet:",
      content.slice(0, 300)
    );
    return {
      lines: [],
      rawError: `JSON non parsabile (chunk ${input.chunkIndex + 1}): ${content.slice(0, 120).replace(/\s+/g, " ")}`,
    };
  }
}

export async function parseBankStatementWithAi(
  text: string,
  opts?: { isTable?: boolean }
): Promise<AiParseResult> {
  const apiKey = process.env.OPENAI_API_KEY?.trim();
  if (!apiKey) {
    return {
      ok: false,
      error:
        "OPENAI_API_KEY assente su questo ambiente (Vercel Production?). Aggiungi la variabile e ridéploya.",
    };
  }

  const model =
    process.env.BANK_OPENAI_MODEL?.trim() ||
    process.env.OPENAI_MODEL?.trim() ||
    "gpt-4o";

  const chunks = chunkPdfText(text, opts?.isTable ? 9000 : 7500).slice(0, 5);
  const allLines: ParsedBankLine[] = [];
  const errors: string[] = [];

  try {
    for (let i = 0; i < chunks.length; i++) {
      const result = await callOpenAiBankChunk({
        apiKey,
        model,
        chunk: chunks[i],
        chunkIndex: i,
        chunkTotal: chunks.length,
        isTable: opts?.isTable,
      });
      if (result.rawError) errors.push(result.rawError);
      allLines.push(...result.lines);
      if (i < chunks.length - 1) {
        await new Promise((r) => setTimeout(r, 400));
      }
    }

    if (allLines.length === 0) {
      return {
        ok: false,
        error:
          errors[0] ||
          "OpenAI non ha estratto movimenti utili (JSON vuoto o non valido su tutti i chunk).",
      };
    }

    return { ok: true, lines: allLines, modelName: model };
  } catch (e) {
    console.error("[bank-pdf-ai]", e);
    return {
      ok: false,
      error: e instanceof Error ? e.message : "Errore chiamata OpenAI",
    };
  }
}

function looksLikeBalanceDescription(desc: string): boolean {
  return /\b(saldo|totale|totali|riepilogo)\b/i.test(desc);
}

export function validateLines(raw: ParsedBankLine[]): {
  lines: ParsedBankLine[];
  doubtful: ParseBankStatementResult["doubtful"];
  corrected: number;
} {
  const lines: ParsedBankLine[] = [];
  const doubtful: ParseBankStatementResult["doubtful"] = [];
  let corrected = 0;

  for (const row of raw) {
    if (looksLikeBalanceDescription(row.description)) {
      doubtful.push({
        description: row.description.slice(0, 160),
        aiAmount: row.amount,
        reason: "Sembra saldo/totale — escluso",
      });
      continue;
    }

    // amountIt: unica fonte affidabile della magnitudine (strict IT)
    let amount = row.amount;
    if (row.amountIt) {
      const fromIt = parseItAmount(row.amountIt, { strict: true });
      if (fromIt == null) {
        doubtful.push({
          description: row.description.slice(0, 160),
          aiAmount: row.amount,
          reason: `amountIt non parsabile in IT strict: «${row.amountIt}»`,
        });
        continue;
      }
      // Segno lo decide applySignRules via colonna/causali
      amount = Math.abs(fromIt);
    }

    if (Math.abs(amount) > MAX_PLAUSIBLE_AMOUNT) {
      doubtful.push({
        description: row.description.slice(0, 160),
        aiAmount: amount,
        reason: `Importo fuori soglia (${amount}) — possibile saldo letto come movimento`,
      });
      continue;
    }

    const ruled = applySignRules({
      description: row.description,
      amount,
      column: row.column ?? null,
    });
    if (ruled.doubtful || ruled.amount === 0) {
      doubtful.push({
        description: row.description.slice(0, 160),
        aiAmount: row.amount,
        reason: ruled.reason || "segno dubbio",
      });
      continue;
    }
    if (Math.sign(ruled.amount) !== Math.sign(row.amount) && row.amount !== 0) {
      corrected += 1;
    }
    lines.push({
      ...row,
      amount: ruled.amount,
      // NON riscrivere column inventandola: tieni quella di origine
      signSource: ruled.signSource,
    });
  }

  const seen = new Set<string>();
  const unique = lines.filter((l) => {
    const h = lineHash(l);
    if (seen.has(h)) return false;
    seen.add(h);
    return true;
  });

  return { lines: unique, doubtful, corrected };
}

export async function parseBankStatementPdf(
  buffer: Buffer
): Promise<ParseBankStatementResult> {
  // Ricostruzione tabellare di supporto (markdown 5 colonne)
  let table: Awaited<
    ReturnType<
      typeof import("@/lib/amministrazione/bank-pdf-table").extractBankTableFromPdf
    >
  > | null = null;
  try {
    const mod = await import("@/lib/amministrazione/bank-pdf-table");
    table = await mod.extractBankTableFromPdf(buffer);
  } catch (e) {
    console.error("[bank-pdf-table]", e);
  }

  const tableMd = table?.markdownTable?.trim() ?? "";
  const rawText = (await extractPdfText(buffer)).trim();

  const schemaHint = `PARAMETRI TABELLA (obbligatori):
1) Data esecuzione
2) Data valuta
3) Importi in USCITA (−) — se pieno, colonna 4 vuota
4) Importi in ENTRATA (+) — se pieno, colonna 3 vuota
5) Descrizione
6) "Bonifico a vs favore" → SEMPRE segno + (entrataCents), nessun dubbio
7) Descrizione con "Storno" → SEMPRE segno +
8) Descrizione con "Interessi" → SEMPRE segno −
Colonne 3 e 4 si alternano. Numeri italiani: 1.234,56 → 123456 centesimi.`;

  const aiInput =
    tableMd.split("\n").length > 3
      ? `${schemaHint}\n\nTABELLA RICOSTRUITA:\n${tableMd}`
      : `${schemaHint}\n\nTESTO PDF:\n${rawText}`;

  if (!rawText && tableMd.split("\n").length <= 3) {
    return {
      text: "",
      lines: [],
      doubtful: [],
      parserModel: "none",
      notes:
        "PDF senza testo/tabella estraibile. Esporta un PDF testuale dalla banca.",
    };
  }

  const allowHeuristic =
    process.env.BANK_PDF_ALLOW_HEURISTIC?.trim() === "1" ||
    process.env.BANK_PDF_ALLOW_HEURISTIC?.trim()?.toLowerCase() === "true";

  // OpenAI con schema 5 colonne (priorità)
  const ai = await parseBankStatementWithAi(aiInput, { isTable: true });
  if (ai.ok && ai.lines.length > 0) {
    const validated = validateLines(ai.lines);
    return {
      text: aiInput.slice(0, 8000),
      lines: validated.lines,
      doubtful: validated.doubtful,
      parserModel: `${ai.modelName}+5col-v2`,
      notes: [
        `AI schema 5 colonne + regole Storno/Bonifico+/Interessi−: ${validated.lines.length} voci.`,
        validated.doubtful.length
          ? `${validated.doubtful.length} escluse.`
          : null,
      ]
        .filter(Boolean)
        .join(" "),
    };
  }

  const aiError = ai.ok ? "OpenAI ok ma 0 movimenti." : ai.error;

  // Fallback: coordinate PDF se AI fallisce
  if (table && table.lines.length > 0) {
    const validated = validateLines(table.lines);
    return {
      text: table.markdownTable,
      lines: validated.lines,
      doubtful: validated.doubtful,
      parserModel: table.layoutFound
        ? "pdfjs-table-v1"
        : "pdfjs-table-partial-v1",
      notes: `${table.notes} (fallback dopo AI: ${aiError}). ${validated.lines.length} voci.`,
    };
  }

  if (!allowHeuristic) {
    return {
      text: aiInput.slice(0, 4000),
      lines: [],
      doubtful: [],
      parserModel: "blocked-no-ai",
      notes: `IMPORT BLOCCATO: ${aiError}`,
    };
  }

  const heuristic = parseBankStatementHeuristic(rawText || aiInput);
  const validated = validateLines(heuristic);
  return {
    text: rawText.slice(0, 8000),
    lines: validated.lines,
    doubtful: validated.doubtful,
    parserModel: "heuristic-fallback-v2",
    notes: `Euristica emergenza. Motivo: ${aiError}`,
  };
}
