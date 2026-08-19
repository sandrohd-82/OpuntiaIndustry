import { createHash } from "crypto";

export type ParsedBankLine = {
  transactionDate: string; // YYYY-MM-DD
  valutaDate: string | null;
  amount: number; // + entrata, - uscita
  description: string;
  counterpartyName: string;
  trnOrCro: string;
};

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

function parseItAmount(raw: string): number | null {
  let s = raw.trim().replace(/\s/g, "");
  if (!s) return null;
  // 1.234,56 oppure 1234,56 oppure -1.234,56
  const neg = s.startsWith("-") || s.endsWith("-") || s.startsWith("(");
  s = s.replace(/[()\-]/g, "");
  if (s.includes(",") && s.includes(".")) {
    s = s.replace(/\./g, "").replace(",", ".");
  } else if (s.includes(",")) {
    s = s.replace(",", ".");
  }
  const n = Number(s);
  if (!Number.isFinite(n)) return null;
  return neg ? -Math.abs(n) : n;
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

/**
 * Parser euristico per estratti conto IT (BCC / generici).
 * Cerca righe con data + importo.
 */
export function parseBankStatementHeuristic(text: string): ParsedBankLine[] {
  const lines = text
    .split("\n")
    .map((l) => l.replace(/\s+/g, " ").trim())
    .filter(Boolean);

  const out: ParsedBankLine[] = [];
  const dateRe = /(\d{1,2}[\/\-.]\d{1,2}[\/\-.]\d{2,4})/g;
  const amountRe =
    /([+-]?\(?\d{1,3}(?:\.\d{3})*,\d{2}\)?|[+-]?\(?\d+,\d{2}\)?)\s*(?:EUR|€)?\s*$/i;

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    if (/saldo|totale|pagina|estratto\s*conto|iban|abi|cab/i.test(line) && !/\d{1,2}[\/\-.]\d{1,2}/.test(line)) {
      continue;
    }
    const dates = [...line.matchAll(dateRe)].map((m) => m[1]);
    const amountMatch = line.match(amountRe);
    if (!dates.length || !amountMatch) continue;

    let amount = parseItAmount(amountMatch[1]);
    if (amount == null || amount === 0) continue;

    // Heuristica segno da parole chiave
    if (
      /addebito|prelievo|pagamento|bonifico\s*a\s|uscita|spesa|canone|commiss/i.test(
        line
      ) &&
      amount > 0
    ) {
      amount = -amount;
    }
    if (
      /accredito|bonifico\s*da|entrata|versamento|incasso|storno\s*comm/i.test(
        line
      ) &&
      amount < 0
    ) {
      amount = Math.abs(amount);
    }

    const txDate = toIsoFromIt(dates[0]);
    if (!txDate) continue;
    const valutaDate = dates[1] ? toIsoFromIt(dates[1]) : txDate;

    let description = line
      .replace(dateRe, " ")
      .replace(amountRe, " ")
      .replace(/\s+/g, " ")
      .trim();
    if (description.length < 3 && lines[i + 1]) {
      description = `${description} ${lines[i + 1]}`.trim();
    }

    const trn =
      line.match(/\b(?:TRN|CRO|CUP|ID)[:\s]*([A-Z0-9]+)/i)?.[1] || "";

    out.push({
      transactionDate: txDate,
      valutaDate,
      amount,
      description: description || "Movimento da estratto PDF",
      counterpartyName: "",
      trnOrCro: trn,
    });
  }

  // Dedup locale
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
  const system = `Sei un estrattore di movimenti da estratto conto bancario italiano (es. BCC).
Dal testo PDF estrai TUTTE le operazioni in JSON:
{"lines":[{"transactionDate":"YYYY-MM-DD","valutaDate":"YYYY-MM-DD|null","amount":number,"description":"...","counterpartyName":"...","trnOrCro":"..."}]}
Regole:
- amount POSITIVO = accredito/entrata; NEGATIVO = addebito/uscita
- ignora saldi, intestazioni, totali, pie' di pagina
- una riga = un movimento
- se non trovi movimenti: {"lines":[]}`;

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
      const amount = Number(r.amount);
      if (!Number.isFinite(amount) || amount === 0) continue;
      const valutaRaw = r.valutaDate == null ? null : String(r.valutaDate).slice(0, 10);
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
      notes: "PDF senza testo estraibile (possibile scansione/immagine). Esporta un PDF testuale dalla banca.",
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

  const heuristic = parseBankStatementHeuristic(text);
  return {
    text,
    lines: heuristic,
    parserModel: ai ? `${ai.modelName}+heuristic` : "heuristic",
    notes: ai
      ? `AI senza voci utili; euristica: ${heuristic.length} movimenti.`
      : `Euristica: ${heuristic.length} movimenti. (Opzionale: OPENAI_API_KEY migliora lo scorporo.)`,
  };
}
