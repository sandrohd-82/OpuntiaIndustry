import { createHash } from "crypto";

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
  let s = s0
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
 * Causali ENTRATA — ristrette (niente "versamento" generico: F24 VERSAMENTO = uscita).
 * Storno da solo NON forza +: la colonna PDF decide; qui solo tie-breaker senza colonna.
 */
const AVERE_CAUSAL_RE =
  /bonifico\s+a\s+v\.?\s*s\.?\s+favore|bonifico\s+a\s+vs\.?\s+favore|bonifico\s+a\s+vostro\s+favore|a\s+vs\.?\s+favore|a\s+vostro\s+favore|\bbonifico\s+(?:da|ricevuto)\b|\bgiroconto\s+in\s+entrata\b|\b(?:accredit\w*)\b|\bincassi?\b(?!\s+(?:sdd|rid|commiss))/i;

/** Causali tipiche USCITA. */
const DARE_CAUSAL_RE =
  /\b(?:pagament\w*|addebit\w*|preliev\w*|canon\w*|commission\w*|\brid\b|\bsdd\b|\bmav\b|\brav\b|\bf24\b|bollettin\w*|utenz\w*|delega)\b|\bbonifico\s+(?:a|verso)\b(?!\s+v\.?\s*s|\s+vs|\s+vostro)|\bsepa\s*direct\b|\bassegno\s+emesso\b|\bgiroconto\s+in\s+uscita\b|\bversamento\s+unitario\b/i;

export function isAvereCausal(text: string): boolean {
  return AVERE_CAUSAL_RE.test(text);
}

export function isDareCausal(text: string): boolean {
  return DARE_CAUSAL_RE.test(text);
}

/**
 * Regole segno — COLONNA PDF prima di tutto.
 * + solo con colonna AVERE (o causale AVERE se colonna assente).
 * Default senza evidenza: DARE (−). Mai inventare entrate.
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
  const avereCausal = isAvereCausal(text);
  const dareCausal = isDareCausal(text);

  // 1) Colonna PDF = fonte di verità assoluta (niente override da causali)
  if (col === "DARE") {
    return { amount: -mag, signSource: "column-dare", doubtful: false };
  }
  if (col === "AVERE") {
    return { amount: mag, signSource: "column-avere", doubtful: false };
  }

  // 2) Senza colonna: causali; ambiguità → escluso
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

  // 3) Nessuna evidenza: mai inventare +
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
 * Priorità amountIt (stringa IT) → dareIt/avereIt → mai fidarsi di float JSON
 * che confondono 25,28 con 25.280.
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
          : n > 0 && col == null
            ? -Math.abs(n) // senza colonna: non fidarsi del +
            : n;
    return { amount: signed, column: col, amountIt: rawAmount };
  }
  if (typeof rawAmount === "number" && Number.isFinite(rawAmount)) {
    // Float JSON: sospetto se ha molti zeri (possibile ×1000 da 25.28→25280)
    const mag = Math.abs(rawAmount);
    if (mag === 0) return null;
    if (mag >= 1000 && Number.isInteger(mag) && mag % 1000 === 0) {
      // sospetto gonfiamento: richiedi amountIt
      return null;
    }
    const signed =
      col === "AVERE"
        ? mag
        : col === "DARE"
          ? -mag
          : rawAmount > 0
            ? -mag
            : -mag;
    return {
      amount: signed,
      column: col,
      amountIt: mag.toFixed(2).replace(".", ","),
    };
  }

  return null;
}

export async function parseBankStatementWithAi(
  text: string
): Promise<{ lines: ParsedBankLine[]; modelName: string } | null> {
  const apiKey = process.env.OPENAI_API_KEY?.trim();
  if (!apiKey) return null;

  const model =
    process.env.BANK_OPENAI_MODEL?.trim() ||
    process.env.OPENAI_MODEL?.trim() ||
    "gpt-4o";
  const excerpt = text.slice(0, 32000);
  const system = `Sei un estrattore CONTABILE di movimenti da estratto conto italiano (BCC).
Errori di importo o segno causano gravi problemi: sii pedante.

Rispondi SOLO JSON:
{"lines":[{
  "transactionDate":"YYYY-MM-DD",
  "valutaDate":"YYYY-MM-DD|null",
  "amountIt":"25,28",
  "dareIt":null,
  "avereIt":null,
  "column":"DARE"|"AVERE",
  "description":"...",
  "counterpartyName":"...",
  "trnOrCro":"..."
}]}

REGOLE OBBLIGATORIE:
1. amountIt = stringa ITALIANA esatta dal PDF (virgola = centesimi, punto = migliaia).
   Esempi: "25,28" ; "1.234,56" ; "50,00". MAI float JSON. MAI "25.28". MAI "25280".
2. column = "DARE" se l'importo è in Mov.DARE (uscita); "AVERE" se in Mov.AVERE (entrata).
3. Se vedi entrambe le colonne valorizzate sulla stessa riga, usa dareIt e avereIt e crea DUE elementi (uno DARE, uno AVERE).
4. IGNORA completamente: Saldo, Saldo contabile, Saldo disponibile, Totali, intestazioni, piè di pagina.
   NON importare mai un saldo come movimento (es. non trasformare un saldo 25.280,00 in un movimento).
5. "Storno" NON decide il segno da solo: conta SOLO la colonna DARE/AVERE del PDF.
6. "Bonifico a vs favore" / "Bonifico a vs. favore" / incassi in colonna AVERE → AVERE.
7. F24, pagamenti, addebiti, commissioni, RID, "versamento unitario" → di solito DARE.
8. Se non sei sicuro della colonna → column="DARE" (mai inventare entrate).
9. Se non trovi movimenti: {"lines":[]}`;

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
            content: `Estrai SOLO i movimenti (no saldi/totali). amountIt obbligatorio in formato italiano.\n\n${excerpt}`,
          },
        ],
      }),
    });
    if (!res.ok) {
      console.error(
        "[bank-pdf-ai]",
        res.status,
        await res.text().catch(() => "")
      );
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

      // Preferisci due colonne esplicite → due movimenti
      const dareIt = r.dareIt != null ? String(r.dareIt).trim() : "";
      const avereIt = r.avereIt != null ? String(r.avereIt).trim() : "";
      const valutaRaw =
        r.valutaDate == null ? null : String(r.valutaDate).slice(0, 10);
      const valutaDate =
        valutaRaw && /^\d{4}-\d{2}-\d{2}$/.test(valutaRaw) ? valutaRaw : null;
      const description =
        String(r.description ?? "").trim() || "Movimento PDF";
      const counterpartyName = String(r.counterpartyName ?? "").trim();
      const trnOrCro = String(r.trnOrCro ?? "").trim();

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
    return { lines, modelName: model };
  } catch (e) {
    console.error("[bank-pdf-ai]", e);
    return null;
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
      `AI (${ai.modelName}) + regole: ${validated.lines.length} voci.`,
      validated.corrected
        ? `${validated.corrected} segni corretti (colonna/default DARE).`
        : null,
      validated.doubtful.length
        ? `${validated.doubtful.length} escluse (saldo/contrasto/importo dubbio).`
        : null,
      "amountIt IT; colonna DARE/AVERE prioritaria; saldi ignorati.",
    ]
      .filter(Boolean)
      .join(" ");

    return {
      text,
      lines: validated.lines,
      doubtful: validated.doubtful,
      parserModel: `${ai.modelName}+rules-v2`,
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
      ? "heuristic-fallback-v2"
      : "heuristic-dare-avere-v2",
    notes: [
      ai
        ? "AI senza voci utili — fallback euristico v2."
        : "OPENAI_API_KEY assente/errore — fallback euristico v2.",
      `${validated.lines.length} voci; saldi esclusi; default DARE.`,
      validated.doubtful.length
        ? `${validated.doubtful.length} escluse.`
        : null,
    ]
      .filter(Boolean)
      .join(" "),
  };
}
