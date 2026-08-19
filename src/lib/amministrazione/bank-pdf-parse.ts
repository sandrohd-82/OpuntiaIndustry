import { createHash } from "crypto";

export type ParsedBankLine = {
  transactionDate: string; // YYYY-MM-DD
  valutaDate: string | null;
  amount: number; // + entrata (AVERE), - uscita (DARE)
  description: string;
  counterpartyName: string;
  trnOrCro: string;
};

/** Importo italiano: `.` = migliaia, `,` = centesimi (es. 1.234,56 → 1234.56). */
export function parseItAmount(raw: string): number | null {
  let s = raw.trim().replace(/\s/g, "").replace(/€|EUR/gi, "");
  if (!s) return null;
  const neg = s.startsWith("-") || s.endsWith("-") || s.startsWith("(");
  s = s.replace(/[()\-+]/g, "");
  // Solo formato IT con virgola decimali
  if (!s.includes(",")) {
    // intero senza centesimi (raro): 1.234 → 1234
    if (/^\d{1,3}(?:\.\d{3})+$/.test(s)) {
      const n = Number(s.replace(/\./g, ""));
      return Number.isFinite(n) ? (neg ? -n : n) : null;
    }
    const n = Number(s);
    return Number.isFinite(n) ? (neg ? -Math.abs(n) : n) : null;
  }
  // 1.234,56 oppure 1234,56
  const normalized = s.replace(/\./g, "").replace(",", ".");
  const n = Number(normalized);
  if (!Number.isFinite(n)) return null;
  return neg ? -Math.abs(n) : n;
}

const IT_AMOUNT_RE = /\d{1,3}(?:\.\d{3})*,\d{2}|\d+,\d{2}/g;

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
 * Segno da colonne Mov.DARE (uscita −) / Mov.AVERE (entrata +).
 * Se in riga ci sono due importi IT, il primo è DARE e il secondo AVERE
 * (tipico layout estratto BCC dopo estrazione PDF).
 */
function resolveDareAvereAmounts(
  line: string,
  amountTokens: string[]
): number[] {
  const lower = line.toLowerCase().replace(/\s+/g, " ");
  const results: number[] = [];

  // Due importi in coda → [DARE, AVERE]
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

    // Parole chiave esplicite sulla riga
    const dareHit =
      /mov\.?\s*dare|\bdare\b|addebito|uscita|prelievo/.test(lower) &&
      !/mov\.?\s*avere|\bavere\b|accredito|entrata/.test(lower);
    const avereHit =
      /mov\.?\s*avere|\bavere\b|accredito|entrata|versamento|incasso/.test(
        lower
      ) && !/mov\.?\s*dare|\bdare\b/.test(lower);

    if (dareHit) {
      results.push(-mag);
      return results;
    }
    if (avereHit) {
      results.push(mag);
      return results;
    }

    // Posizione rispetto alle etichette nella stessa riga
    const dareIdx = lower.search(/mov\.?\s*dare|\bdare\b/);
    const avereIdx = lower.search(/mov\.?\s*avere|\bavere\b/);
    const amtIdx = lower.search(IT_AMOUNT_RE);
    if (dareIdx >= 0 && avereIdx >= 0 && amtIdx >= 0) {
      // Importo più vicino a quale colonna?
      if (Math.abs(amtIdx - dareIdx) <= Math.abs(amtIdx - avereIdx)) {
        results.push(-mag);
      } else {
        results.push(mag);
      }
      return results;
    }
    if (dareIdx >= 0 && amtIdx > dareIdx && (avereIdx < 0 || amtIdx < avereIdx)) {
      results.push(-mag);
      return results;
    }
    if (avereIdx >= 0 && amtIdx > avereIdx) {
      results.push(mag);
      return results;
    }

    // Default: senza contesto trattiamo come AVERE solo se già negativo nel token, altrimenti
    // lasciamo segno dal parse (raro) — meglio non inventare: default DARE se tipico "uscita" no.
    // Conservativo: se il PDF non dice nulla, importo positivo come AVERE (entrata) è pericoloso.
    // Preferiamo lasciare il valore assoluto positivo solo se non c'è DARE in documento... 
    // User said DARE=out AVERE=in. Without column, skip? Or keep heuristic from keywords above.
    // Ultimo fallback: mantieni come positivo (avere) solo se linea sembra accredito, else negativo.
    if (
      /bonifico\s*(a|a\s+favore)|pagamento| RID |sepa|canone|commiss|assegno\s*emesso/i.test(
        line
      )
    ) {
      results.push(-mag);
    } else if (
      /bonifico\s*(da|da\s+)|accredito|stipend|ricavo|versamento/i.test(line)
    ) {
      results.push(mag);
    } else {
      // Senza indizi: un solo importo → registra come AVERE positivo e leave note in description? 
      // Meglio: negativo solo se "dare" nel documento header context — handled outside.
      results.push(mag);
    }
    return results;
  }

  return results;
}

/**
 * Parser estratti conto IT con colonne Mov.DARE / Mov.AVERE.
 * Formato importi: 1.234,56 → migliaia con `.`, centesimi con `,`.
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

    // Evita riga di soli saldi
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

/** Usa OpenAI se disponibile per scorporare le voci dal testo PDF. */
export async function parseBankStatementWithAi(
  text: string
): Promise<{ lines: ParsedBankLine[]; modelName: string } | null> {
  const apiKey = process.env.OPENAI_API_KEY?.trim();
  if (!apiKey) return null;

  const model = process.env.OPENAI_MODEL?.trim() || "gpt-4o-mini";
  const excerpt = text.slice(0, 28000);
  const system = `Sei un estrattore di movimenti da estratto conto bancario italiano (BCC / simili).
Dal testo PDF estrai TUTTE le operazioni in JSON:
{"lines":[{"transactionDate":"YYYY-MM-DD","valutaDate":"YYYY-MM-DD|null","amount":number,"description":"...","counterpartyName":"...","trnOrCro":"..."}]}

Regole OBBLIGATORIE:
- Colonna Mov.DARE (o DARE) = USCITE → amount NEGATIVO
- Colonna Mov.AVERE (o AVERE) = ENTRATE → amount POSITIVO
- Formato numeri italiani: il punto "." è separatore delle MIGLIAIA; la virgola "," sono i CENTESIMI.
  Esempi: 1.234,56 → 1234.56 ; 50,00 → 50.00 ; 12.500,10 → 12500.10
- Ignora saldi, intestazioni, totali, piè di pagina, sole etichette "Mov.DARE"/"Mov.AVERE"
- Una riga di estratto = un movimento (se DARE e AVERE valorizzati entrambi, due movimenti)
- Se non trovi movimenti: {"lines":[]}`;

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
          { role: "user", content: excerpt },
        ],
      }),
    });
    if (!res.ok) return null;
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
        // spesso l'AI lascia stringa italiana
        const fromIt = parseItAmount(String(r.amount ?? ""));
        if (fromIt == null || fromIt === 0) continue;
        amount = fromIt;
      }
      const valutaRaw =
        r.valutaDate == null ? null : String(r.valutaDate).slice(0, 10);
      lines.push({
        transactionDate,
        valutaDate:
          valutaRaw && /^\d{4}-\d{2}-\d{2}$/.test(valutaRaw) ? valutaRaw : null,
        amount,
        description: String(r.description ?? "").trim() || "Movimento PDF",
        counterpartyName: String(r.counterpartyName ?? "").trim(),
        trnOrCro: String(r.trnOrCro ?? "").trim(),
      });
    }
    return { lines, modelName: model };
  } catch {
    return null;
  }
}

export async function parseBankStatementPdf(buffer: Buffer): Promise<{
  text: string;
  lines: ParsedBankLine[];
  parserModel: string;
  notes: string;
}> {
  const text = await extractPdfText(buffer);
  if (!text.trim()) {
    return {
      text: "",
      lines: [],
      parserModel: "none",
      notes:
        "PDF senza testo estraibile (possibile scansione/immagine). Esporta un PDF testuale dalla banca.",
    };
  }

  const hasDareAvere = /mov\.?\s*dare|mov\.?\s*avere|\bdare\b|\bavere\b/i.test(
    text
  );
  const heuristic = parseBankStatementHeuristic(text);

  // Su estratti DARE/AVERE preferisci sempre l'euristica dedicata se trova voci
  if (hasDareAvere && heuristic.length > 0) {
    const ai = await parseBankStatementWithAi(text);
    // Se AI trova molte più voci, usala; altrimenti euristica BCC
    if (ai && ai.lines.length > heuristic.length * 1.2) {
      return {
        text,
        lines: ai.lines,
        parserModel: ai.modelName,
        notes: `Estratte ${ai.lines.length} voci (DARE=uscita, AVERE=entrata; numeri IT).`,
      };
    }
    return {
      text,
      lines: heuristic,
      parserModel: "heuristic-dare-avere",
      notes: `Estratte ${heuristic.length} voci: Mov.DARE=uscite (−), Mov.AVERE=entrate (+); importi 1.234,56.`,
    };
  }

  const ai = await parseBankStatementWithAi(text);
  if (ai && ai.lines.length > 0) {
    return {
      text,
      lines: ai.lines,
      parserModel: ai.modelName,
      notes: `Estratte ${ai.lines.length} voci via AI.`,
    };
  }

  return {
    text,
    lines: heuristic,
    parserModel: "heuristic",
    notes: `Euristica: ${heuristic.length} movimenti.`,
  };
}
