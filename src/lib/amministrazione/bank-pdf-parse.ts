import { createHash } from "crypto";

export type ParsedBankLine = {
  transactionDate: string; // YYYY-MM-DD
  valutaDate: string | null;
  amount: number; // + entrata (AVERE), - uscita (DARE)
  description: string;
  counterpartyName: string;
  trnOrCro: string;
  /** Colonna estratto se nota. */
  column?: "DARE" | "AVERE" | null;
  /** Come è stato deciso il segno. */
  signSource?: string;
};

export type ParseBankStatementResult = {
  text: string;
  lines: ParsedBankLine[];
  /** Voci escluse per contrasto AI/regole. */
  doubtful: Array<{
    description: string;
    aiAmount: number;
    reason: string;
  }>;
  parserModel: string;
  notes: string;
};

/** Importo italiano: `.` = migliaia, `,` = centesimi (es. 1.234,56 → 1234.56). */
export function parseItAmount(raw: string): number | null {
  let s = raw.trim().replace(/\s/g, "").replace(/€|EUR/gi, "");
  if (!s) return null;
  const neg = s.startsWith("-") || s.endsWith("-") || s.startsWith("(");
  s = s.replace(/[()\-+]/g, "");
  if (!s.includes(",")) {
    if (/^\d{1,3}(?:\.\d{3})+$/.test(s)) {
      const n = Number(s.replace(/\./g, ""));
      return Number.isFinite(n) ? (neg ? -n : n) : null;
    }
    const n = Number(s);
    return Number.isFinite(n) ? (neg ? -Math.abs(n) : n) : null;
  }
  const normalized = s.replace(/\./g, "").replace(",", ".");
  const n = Number(normalized);
  if (!Number.isFinite(n)) return null;
  return neg ? -Math.abs(n) : n;
}

const IT_AMOUNT_RE = /\d{1,3}(?:\.\d{3})*,\d{2}|\d+,\d{2}/g;

/** Causali tipiche di ENTRATA (Mov.AVERE) → segno +. */
const AVERE_CAUSAL_RE =
  /\bstorno\b|bonifico\s+a\s+v\.?\s*s\.?\s+favore|bonifico\s+a\s+vs\.?\s+favore|bonifico\s+a\s+vostro\s+favore|a\s+vs\.?\s+favore|a\s+vostro\s+favore|\bincasso\b|accredito|versamento|bonifico\s+(da|ricevuto)|giroconto\s+in\s+entrata|rientro|ricavo/i;

/** Causali tipiche di USCITA (Mov.DARE) → segno −. */
const DARE_CAUSAL_RE =
  /bonifico\s+(a|verso)|pagamento|addebito|prelievo|canone|commiss| RID\b|sdd|sepa\s*direct|assegno\s*emesso|utenze|f24|mav|rav|bollettino|giroconto\s+in\s+uscita/i;

export function isAvereCausal(text: string): boolean {
  return AVERE_CAUSAL_RE.test(text);
}

export function isDareCausal(text: string): boolean {
  return DARE_CAUSAL_RE.test(text) && !isAvereCausal(text);
}

/**
 * Regole di segno (autoritative rispetto all'AI quando c'è contrasto chiaro):
 * - + solo se colonna AVERE oppure causale whitelist (Storno, Bonifico a vs favore, Incasso…)
 * - default / DARE / dubbio senza evidenza AVERE → −
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

  const text = `${input.description} ${input.column ?? ""}`;
  const avereCausal = isAvereCausal(text);
  const dareCausal = isDareCausal(text);
  const col = input.column ?? null;
  const aiPositive = input.amount > 0;

  // Causali whitelist: sempre prioritarie
  if (avereCausal && !dareCausal) {
    return { amount: mag, signSource: "causal-avere", doubtful: false };
  }
  if (dareCausal && !avereCausal) {
    if (aiPositive && col === "AVERE") {
      return {
        amount: mag,
        signSource: "conflict",
        doubtful: true,
        reason:
          "Contrasto: causale da uscita ma colonna/AI AVERE — escluso da import automatico",
      };
    }
    return { amount: -mag, signSource: "causal-dare", doubtful: false };
  }
  if (avereCausal && dareCausal) {
    return {
      amount: aiPositive ? mag : -mag,
      signSource: "conflict",
      doubtful: true,
      reason: "Causale ambigua (entrate e uscite) — escluso",
    };
  }

  // Colonna esplicita dall'AI / layout
  if (col === "AVERE") {
    return { amount: mag, signSource: "column-avere", doubtful: false };
  }
  if (col === "DARE") {
    return { amount: -mag, signSource: "column-dare", doubtful: false };
  }

  // Nessuna colonna: default DARE (−). Se AI aveva messo + senza evidenza → correggi a −
  if (aiPositive) {
    return {
      amount: -mag,
      signSource: "default-dare-corrected",
      doubtful: false,
    };
  }
  return { amount: -mag, signSource: "default-dare", doubtful: false };
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

/** Estrae testo da buffer PDF (pdf-parse). */
export async function extractPdfText(buffer: Buffer): Promise<string> {
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const pdfParse = require("pdf-parse") as (
    data: Buffer
  ) => Promise<{ text: string }>;
  const parsed = await pdfParse(buffer);
  return String(parsed.text || "").replace(/\r/g, "");
}

function extractDates(line: string): string[] {
  const dateRe = /(\d{1,2}[\/\-.]\d{1,2}[\/\-.]\d{2,4})/g;
  return [...line.matchAll(dateRe)].map((m) => m[1]);
}

function extractItAmounts(line: string): string[] {
  return [...line.matchAll(IT_AMOUNT_RE)].map((m) => m[0]);
}

/**
 * Segno da colonne Mov.DARE (−) / Mov.AVERE (+).
 * Default senza evidenza AVERE: uscita (−).
 */
function resolveDareAvereAmounts(
  line: string,
  amountTokens: string[]
): number[] {
  const lower = line.toLowerCase().replace(/\s+/g, " ");
  const results: number[] = [];

  if (amountTokens.length >= 2) {
    const dareRaw = amountTokens[amountTokens.length - 2];
    const avereRaw = amountTokens[amountTokens.length - 1];
    const dare = parseItAmount(dareRaw);
    const avere = parseItAmount(avereRaw);
    if (dare != null && dare !== 0) results.push(-Math.abs(dare));
    if (avere != null && avere !== 0) results.push(Math.abs(avere));
    return results;
  }

  if (amountTokens.length === 1) {
    const abs = parseItAmount(amountTokens[0]);
    if (abs == null || abs === 0) return [];
    const mag = Math.abs(abs);
    const signed = applySignRules({
      description: line,
      amount: mag,
      column: /mov\.?\s*avere|\bavere\b/i.test(lower)
        ? "AVERE"
        : /mov\.?\s*dare|\bdare\b/i.test(lower)
          ? "DARE"
          : null,
    });
    if (!signed.doubtful && signed.amount !== 0) results.push(signed.amount);
    return results;
  }

  return results;
}

/**
 * Parser euristico di fallback (solo se AI assente/fallisce).
 * Default: Mov.DARE (−); + solo AVERE / causali whitelist.
 */
export function parseBankStatementHeuristic(text: string): ParsedBankLine[] {
  const lines = text
    .split("\n")
    .map((l) => l.replace(/\s+/g, " ").trim())
    .filter(Boolean);

  const out: ParsedBankLine[] = [];
  const skipLine =
    /^(saldo|totale|pagina|estratto|iban|abi|cab|mov\.?\s*dare|mov\.?\s*avere|data\s*valuta|data\s*contabile)/i;

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    if (skipLine.test(line) && extractItAmounts(line).length === 0) continue;

    const dates = extractDates(line);
    const amountTokens = extractItAmounts(line);
    if (!dates.length || !amountTokens.length) continue;
    if (/saldo\s*(contabile|disponibile|iniziale|finale)/i.test(line)) continue;

    const txDate = toIsoFromIt(dates[0]);
    if (!txDate) continue;
    const valutaDate = dates[1] ? toIsoFromIt(dates[1]) : txDate;

    const signedAmounts = resolveDareAvereAmounts(line, amountTokens);
    if (!signedAmounts.length) continue;

    let description = line
      .replace(/(\d{1,2}[\/\-.]\d{1,2}[\/\-.]\d{2,4})/g, " ")
      .replace(IT_AMOUNT_RE, " ")
      .replace(/mov\.?\s*dare|mov\.?\s*avere/gi, " ")
      .replace(/\s+/g, " ")
      .trim();
    if (description.length < 3 && lines[i + 1]) {
      const next = lines[i + 1];
      if (!extractDates(next).length || extractItAmounts(next).length === 0) {
        description = `${description} ${next}`.trim();
      }
    }

    const trn =
      line.match(/\b(?:TRN|CRO|CUP|ID)[:\s]*([A-Z0-9]+)/i)?.[1] || "";

    for (const amount of signedAmounts) {
      out.push({
        transactionDate: txDate,
        valutaDate,
        amount,
        description:
          description ||
          (amount < 0 ? "Mov.DARE (uscita)" : "Mov.AVERE (entrata)"),
        counterpartyName: "",
        trnOrCro: trn,
        column: amount < 0 ? "DARE" : "AVERE",
        signSource: "heuristic",
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

function normalizeAiColumn(
  raw: unknown
): "DARE" | "AVERE" | null {
  const s = String(raw ?? "")
    .trim()
    .toUpperCase();
  if (s.includes("AVERE") || s === "C" || s === "CREDIT") return "AVERE";
  if (s.includes("DARE") || s === "D" || s === "DEBIT") return "DARE";
  return null;
}

/** Usa OpenAI per scorporare le voci (modalità B: AI prima). */
export async function parseBankStatementWithAi(
  text: string
): Promise<{ lines: ParsedBankLine[]; modelName: string } | null> {
  const apiKey = process.env.OPENAI_API_KEY?.trim();
  if (!apiKey) return null;

  const model = process.env.OPENAI_MODEL?.trim() || "gpt-4o-mini";
  const excerpt = text.slice(0, 28000);
  const system = `Sei un estrattore PRECISIONE di movimenti da estratto conto bancario italiano (BCC / simili).
Rispondi SOLO JSON:
{"lines":[{"transactionDate":"YYYY-MM-DD","valutaDate":"YYYY-MM-DD|null","amount":number,"column":"DARE"|"AVERE","description":"...","counterpartyName":"...","trnOrCro":"..."}]}

REGOLE SEGNO (CRITICHE — un errore crea gravi problemi contabili):
1. Colonna Mov.DARE / DARE = USCITA → amount DEVE essere NEGATIVO (es. -150.00)
2. Colonna Mov.AVERE / AVERE = ENTRATA → amount DEVE essere POSITIVO (es. 150.00)
3. Il campo "column" è OBBLIGATORIO: "DARE" o "AVERE" in base a dove sta l'importo sul PDF.
4. Se l'importo è nella colonna DARE → column="DARE" e amount negativo.
5. Se l'importo è nella colonna AVERE → column="AVERE" e amount positivo.
6. Causali tipiche ENTRATA (+): "Storno", "Bonifico a vs favore", "Bonifico a vs. favore", "Incasso", "Accredito", "Versamento".
7. Causali tipiche USCITA (−): pagamenti, bonifici in uscita, addebiti, canoni, F24, RID, commissioni.
8. DEFAULT se non sei sicuro della colonna: tratta come DARE (amount NEGATIVO). NON inventare entrate.
9. Numeri italiani: "." = migliaia, "," = centesimi. 1.234,56 → 1234.56 ; 50,00 → 50
10. Ignora saldi, intestazioni, totali, piè di pagina.
11. Una riga estratto = un movimento. Se sulla stessa riga ci sono DARE e AVERE valorizzati, crea DUE oggetti.
12. Se non trovi movimenti: {"lines":[]}`;

  try {
    const res = await fetch("https://api.openai.com/v1/chat/completions", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model,
        temperature: 0,
        response_format: { type: "json_object" },
        messages: [
          { role: "system", content: system },
          {
            role: "user",
            content: `Estrai i movimenti. Ricorda: SOLO Mov.AVERE e causali tipo Storno/Bonifico a vs favore/Incasso hanno segno +. Tutto il resto è −.\n\n${excerpt}`,
          },
        ],
      }),
    });
    if (!res.ok) {
      console.error("[bank-pdf-ai]", res.status, await res.text().catch(() => ""));
      return null;
    }
    const json = (await res.json()) as {
      choices?: Array<{ message?: { content?: string } }>;
    };
    const content = json.choices?.[0]?.message?.content;
    if (!content) return null;
    const parsed = JSON.parse(content) as { lines?: unknown[] };
    const lines: ParsedBankLine[] = [];
    for (const row of parsed.lines ?? []) {
      if (!row || typeof row !== "object") continue;
      const r = row as Record<string, unknown>;
      const transactionDate = String(r.transactionDate ?? "").slice(0, 10);
      if (!/^\d{4}-\d{2}-\d{2}$/.test(transactionDate)) continue;
      let amount = Number(r.amount);
      if (!Number.isFinite(amount) || amount === 0) {
        const fromIt = parseItAmount(String(r.amount ?? ""));
        if (fromIt == null || fromIt === 0) continue;
        amount = fromIt;
      }
      const valutaRaw =
        r.valutaDate == null ? null : String(r.valutaDate).slice(0, 10);
      const column = normalizeAiColumn(r.column);
      // Se manca column, inferisci dal segno AI (poi le regole correggono)
      const inferredCol =
        column ?? (amount > 0 ? "AVERE" : amount < 0 ? "DARE" : null);

      lines.push({
        transactionDate,
        valutaDate:
          valutaRaw && /^\d{4}-\d{2}-\d{2}$/.test(valutaRaw) ? valutaRaw : null,
        amount,
        description: String(r.description ?? "").trim() || "Movimento PDF",
        counterpartyName: String(r.counterpartyName ?? "").trim(),
        trnOrCro: String(r.trnOrCro ?? "").trim(),
        column: inferredCol,
        signSource: "openai-raw",
      });
    }
    return { lines, modelName: model };
  } catch (e) {
    console.error("[bank-pdf-ai]", e);
    return null;
  }
}

function validateLines(raw: ParsedBankLine[]): {
  lines: ParsedBankLine[];
  doubtful: ParseBankStatementResult["doubtful"];
  corrected: number;
} {
  const lines: ParsedBankLine[] = [];
  const doubtful: ParseBankStatementResult["doubtful"] = [];
  let corrected = 0;

  for (const row of raw) {
    const ruled = applySignRules({
      description: row.description,
      amount: row.amount,
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
    if (Math.sign(ruled.amount) !== Math.sign(row.amount)) {
      corrected += 1;
    }
    lines.push({
      ...row,
      amount: ruled.amount,
      column: ruled.amount > 0 ? "AVERE" : "DARE",
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

/**
 * Opzione B: OpenAI prima (se OPENAI_API_KEY), poi regole di segno.
 * Euristica solo come fallback.
 */
export async function parseBankStatementPdf(
  buffer: Buffer
): Promise<ParseBankStatementResult> {
  const text = await extractPdfText(buffer);
  if (!text.trim()) {
    return {
      text: "",
      lines: [],
      doubtful: [],
      parserModel: "none",
      notes:
        "PDF senza testo estraibile (possibile scansione/immagine). Esporta un PDF testuale dalla banca.",
    };
  }

  const ai = await parseBankStatementWithAi(text);
  if (ai && ai.lines.length > 0) {
    const validated = validateLines(ai.lines);
    const notes = [
      `AI (${ai.modelName}) + regole segno: ${validated.lines.length} voci importabili.`,
      validated.corrected
        ? `${validated.corrected} segni corretti dalle regole (default DARE / causali).`
        : null,
      validated.doubtful.length
        ? `${validated.doubtful.length} voci escluse per contrasto (non importate).`
        : null,
      "Mov.AVERE / Storno / Bonifico a vs favore / Incasso = +; resto = −.",
    ]
      .filter(Boolean)
      .join(" ");

    return {
      text,
      lines: validated.lines,
      doubtful: validated.doubtful,
      parserModel: `${ai.modelName}+rules`,
      notes,
    };
  }

  const heuristic = parseBankStatementHeuristic(text);
  const validated = validateLines(heuristic);
  return {
    text,
    lines: validated.lines,
    doubtful: validated.doubtful,
    parserModel: process.env.OPENAI_API_KEY?.trim()
      ? "heuristic-fallback"
      : "heuristic-dare-avere",
    notes: [
      ai
        ? "AI senza voci utili — usato fallback euristico."
        : "OPENAI_API_KEY assente o errore AI — usato fallback euristico.",
      `${validated.lines.length} voci; default DARE (−); AVERE solo con colonna/causali.`,
      validated.doubtful.length
        ? `${validated.doubtful.length} escluse.`
        : null,
    ]
      .filter(Boolean)
      .join(" "),
  };
}
