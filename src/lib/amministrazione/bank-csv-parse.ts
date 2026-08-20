import type {
  ParseBankStatementResult,
  ParsedBankLine,
} from "@/lib/amministrazione/bank-pdf-parse";
import { parseItAmount } from "@/lib/amministrazione/bank-pdf-parse";

/**
 * Schema CSV fisso — ZERO controlli di business, ZERO OpenAI.
 * Ogni riga dati → 5 campi caricati così come sono:
 * 1 Data (ordinamento)
 * 2 Data Valuta (figurativa)
 * 3 Uscite − (se vuoto → importo da col.4)
 * 4 Entrate + (se vuoto e col.3 piena → già uscite)
 * 5 Causale
 */

export type CsvBankRawFields = {
  rowIndex: number;
  dataRaw: string;
  valutaRaw: string;
  uscitaRaw: string;
  entrataRaw: string;
  causaleRaw: string;
};

export type ParsedBankCsvLine = ParsedBankLine & {
  csvRaw: CsvBankRawFields;
};

/** Data IT → YYYY-MM-DD (anche ISO già valido). */
export function parseBankDateIt(raw: string): string | null {
  const s = String(raw ?? "")
    .replace(/\u00A0/g, " ")
    .trim();
  if (!s) return null;
  if (/^\d{4}-\d{2}-\d{2}/.test(s)) return s.slice(0, 10);
  const m = s.match(/^(\d{1,2})[\/\-.](\d{1,2})[\/\-.](\d{2,4})$/);
  if (!m) return null;
  const dd = Number(m[1]);
  const mm = Number(m[2]);
  let yyyy = Number(m[3]);
  if (yyyy < 100) yyyy += 2000;
  if (mm < 1 || mm > 12 || dd < 1 || dd > 31) return null;
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${yyyy}-${pad(mm)}-${pad(dd)}`;
}

function detectDelimiter(sampleLine: string): ";" | "," | "\t" {
  const counts = {
    ";": (sampleLine.match(/;/g) ?? []).length,
    ",": (sampleLine.match(/,/g) ?? []).length,
    "\t": (sampleLine.match(/\t/g) ?? []).length,
  };
  const best = (
    Object.entries(counts) as Array<[";" | "," | "\t", number]>
  ).sort((a, b) => b[1] - a[1])[0];
  return best && best[1] > 0 ? best[0] : ";";
}

/** Split CSV line respecting quotes. */
export function splitCsvLine(line: string, delimiter: string): string[] {
  const out: string[] = [];
  let cur = "";
  let inQuotes = false;
  for (let i = 0; i < line.length; i++) {
    const ch = line[i]!;
    if (ch === '"') {
      if (inQuotes && line[i + 1] === '"') {
        cur += '"';
        i += 1;
      } else {
        inQuotes = !inQuotes;
      }
      continue;
    }
    if (ch === delimiter && !inQuotes) {
      out.push(cur);
      cur = "";
      continue;
    }
    cur += ch;
  }
  out.push(cur);
  return out.map((c) => c.replace(/^\uFEFF/, "").trim());
}

function decodeCsvBuffer(buffer: Buffer): string {
  let text = buffer.toString("utf8");
  if (text.includes("\uFFFD") || /[\x80-\x9F]/.test(text.slice(0, 2000))) {
    try {
      text = new TextDecoder("latin1").decode(buffer);
    } catch {
      /* keep utf8 */
    }
  }
  return text.replace(/^\uFEFF/, "");
}

function isLikelyHeaderRow(cols: string[]): boolean {
  const c0 = (cols[0] ?? "").toLowerCase().trim();
  if (parseBankDateIt(cols[0] ?? "")) return false;
  return (
    c0.includes("data") ||
    c0 === "date" ||
    /uscita|entrata|causale|descrizione|dare|avere/.test(
      cols.slice(0, 5).join(" ").toLowerCase()
    )
  );
}

/** Importo IT rigoroso: toglie €/spazi, usa parseItAmount, poi fallback. */
export function parseCsvAmountStrict(raw: string): number {
  const s0 = String(raw ?? "")
    .replace(/\u00A0/g, " ")
    .replace(/€|EUR/gi, "")
    .trim();
  if (!s0) return 0;
  const fromIt = parseItAmount(s0, { strict: false });
  if (fromIt != null && Number.isFinite(fromIt)) return Math.abs(fromIt);
  // Fallback: 1.234,56 / 1234,56 / 1234.56
  const cleaned = s0.replace(/\s/g, "").replace(/^\+/, "").replace(/^-/, "");
  if (/^\d{1,3}(\.\d{3})+,\d{1,2}$/.test(cleaned) || /^\d+,\d{1,2}$/.test(cleaned)) {
    const n = Number(cleaned.replace(/\./g, "").replace(",", "."));
    return Number.isFinite(n) ? Math.abs(n) : 0;
  }
  if (/^\d+(\.\d+)?$/.test(cleaned)) {
    const n = Number(cleaned);
    return Number.isFinite(n) ? Math.abs(n) : 0;
  }
  const n = Number(cleaned.replace(/\./g, "").replace(",", "."));
  return Number.isFinite(n) ? Math.abs(n) : 0;
}

export type ParseBankCsvResult = ParseBankStatementResult & {
  lines: ParsedBankCsvLine[];
};

/**
 * Legge il CSV localmente (niente OpenAI).
 * Carica RIGOROSAMENTE ogni riga dati e tutti e 5 i campi.
 */
export function parseBankStatementCsv(buffer: Buffer): ParseBankCsvResult {
  const text = decodeCsvBuffer(buffer);
  // Non scartare righe “vuote” di contenuto: solo linee letteralmente assenti
  const linesRaw = text.split(/\r\n|\n|\r/).map((l) => l.trimEnd());
  // Togli solo trailing newline vuote in coda file
  while (linesRaw.length > 0 && linesRaw[linesRaw.length - 1] === "") {
    linesRaw.pop();
  }

  if (linesRaw.length === 0) {
    return {
      text: "",
      lines: [],
      doubtful: [],
      excluded: [],
      parserModel: "csv-fixed-5col-v2-local",
      notes: "CSV vuoto.",
    };
  }

  const delimiter = detectDelimiter(linesRaw[0]!);
  let start = 0;
  const firstCols = splitCsvLine(linesRaw[0]!, delimiter);
  if (isLikelyHeaderRow(firstCols)) {
    start = 1;
  }

  const lines: ParsedBankCsvLine[] = [];

  for (let i = start; i < linesRaw.length; i++) {
    const cols = splitCsvLine(linesRaw[i]!, delimiter);
    while (cols.length < 5) cols.push("");

    const dataRaw = cols[0] ?? "";
    const valutaRaw = cols[1] ?? "";
    const uscitaRaw = cols[2] ?? "";
    const entrataRaw = cols[3] ?? "";
    const causaleRaw = cols[4] ?? "";

    const transactionDate =
      parseBankDateIt(dataRaw) ??
      (/^\d{4}-\d{2}-\d{2}/.test(dataRaw.trim())
        ? dataRaw.trim().slice(0, 10)
        : "1970-01-01");

    const valutaDate = parseBankDateIt(valutaRaw);

    let amount = 0;
    let column: "DARE" | "AVERE" | null = null;
    let amountIt = "";
    let signSource = "csv-fixed";

    // Col.3 Uscite e Col.4 Entrate: se pieno usa quello (priorità uscite se entrambi)
    if (uscitaRaw.trim()) {
      amount = -parseCsvAmountStrict(uscitaRaw);
      column = "DARE";
      amountIt = uscitaRaw.trim();
      signSource = "csv-col3-uscita";
    } else if (entrataRaw.trim()) {
      amount = parseCsvAmountStrict(entrataRaw);
      column = "AVERE";
      amountIt = entrataRaw.trim();
      signSource = "csv-col4-entrata";
    }

    const rowIndex = i - start; // 0-based tra le sole righe dati
    lines.push({
      transactionDate,
      valutaDate,
      amount,
      description: causaleRaw,
      counterpartyName: "",
      // Indice riga → unicità anche se due voci sono identiche
      trnOrCro: `csv-row:${rowIndex}`,
      column,
      signSource,
      amountIt: amountIt || undefined,
      signNeedsReview: false,
      csvRaw: {
        rowIndex,
        dataRaw,
        valutaRaw,
        uscitaRaw,
        entrataRaw,
        causaleRaw,
      },
    });
  }

  return {
    text: text.slice(0, 8000),
    lines,
    doubtful: [],
    excluded: [],
    parserModel: "csv-fixed-5col-v2-local",
    notes: `CSV locale 5 colonne (senza OpenAI): ${lines.length} righe caricate, tutti i campi presi alla lettera.`,
  };
}
