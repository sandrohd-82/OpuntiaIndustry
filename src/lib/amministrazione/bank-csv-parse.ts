import type {
  ParseBankStatementResult,
  ParsedBankLine,
} from "@/lib/amministrazione/bank-pdf-parse";
import { parseItAmount } from "@/lib/amministrazione/bank-pdf-parse";

/**
 * Schema CSV fisso (nessun controllo / mapping intestazioni):
 * 1 Data (ordinamento)
 * 2 Data Valuta (solo figurativa)
 * 3 Uscite − (se vuoto → ignora)
 * 4 Entrate + (se vuoto → ignora)
 * 5 Causale
 */

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
      out.push(cur.trim());
      cur = "";
      continue;
    }
    cur += ch;
  }
  out.push(cur.trim());
  return out;
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
  const c0 = (cols[0] ?? "").toLowerCase();
  if (parseBankDateIt(cols[0] ?? "")) return false;
  return (
    c0.includes("data") ||
    c0 === "date" ||
    /uscita|entrata|causale|descrizione|dare|avere/.test(
      cols.slice(0, 5).join(" ").toLowerCase()
    )
  );
}

/**
 * Parsing CSV a 5 colonne fisse. Nessuna esclusione di righe dati.
 * Solo l’eventuale riga di intestazione (senza data) viene ignorata.
 */
export function parseBankStatementCsv(
  buffer: Buffer
): ParseBankStatementResult {
  const text = decodeCsvBuffer(buffer);
  const linesRaw = text
    .split(/\r\n|\n|\r/)
    .map((l) => l.trimEnd())
    .filter((l) => l.length > 0);

  if (linesRaw.length === 0) {
    return {
      text: "",
      lines: [],
      doubtful: [],
      excluded: [],
      parserModel: "csv-fixed-5col-v1",
      notes: "CSV vuoto.",
    };
  }

  const delimiter = detectDelimiter(linesRaw[0]!);
  let start = 0;
  const firstCols = splitCsvLine(linesRaw[0]!, delimiter);
  if (isLikelyHeaderRow(firstCols)) {
    start = 1;
  }

  const lines: ParsedBankLine[] = [];

  for (let i = start; i < linesRaw.length; i++) {
    const cols = splitCsvLine(linesRaw[i]!, delimiter);
    // Pad a 5 colonne
    while (cols.length < 5) cols.push("");

    const dataRaw = cols[0] ?? "";
    const valutaRaw = cols[1] ?? "";
    const uscitaRaw = (cols[2] ?? "").trim();
    const entrataRaw = (cols[3] ?? "").trim();
    const causale = (cols[4] ?? "").trim() || "—";

    // Data: obbligatoria per ordinamento; se il file è pulito è sempre valida
    const transactionDate =
      parseBankDateIt(dataRaw) ??
      // Non saltare la riga: fallback ISO grezzo o data minima
      ( /^\d{4}-\d{2}-\d{2}/.test(dataRaw.trim())
        ? dataRaw.trim().slice(0, 10)
        : "1970-01-01");

    const valutaDate = valutaRaw ? parseBankDateIt(valutaRaw) : null;

    let amount = 0;
    let column: "DARE" | "AVERE" | null = null;
    let amountIt: string | undefined;
    let signSource = "csv-fixed";

    if (uscitaRaw) {
      const n = parseItAmount(uscitaRaw, { strict: false });
      const mag =
        n != null
          ? Math.abs(n)
          : Math.abs(Number(String(uscitaRaw).replace(/\./g, "").replace(",", ".")) || 0);
      amount = -mag;
      column = "DARE";
      amountIt = uscitaRaw;
      signSource = "csv-col3-uscita";
    } else if (entrataRaw) {
      const n = parseItAmount(entrataRaw, { strict: false });
      const mag =
        n != null
          ? Math.abs(n)
          : Math.abs(Number(String(entrataRaw).replace(/\./g, "").replace(",", ".")) || 0);
      amount = mag;
      column = "AVERE";
      amountIt = entrataRaw;
      signSource = "csv-col4-entrata";
    }

    lines.push({
      transactionDate,
      valutaDate,
      amount,
      description: causale.slice(0, 2000),
      counterpartyName: "",
      trnOrCro: "",
      column,
      signSource,
      amountIt,
      signNeedsReview: false,
    });
  }

  return {
    text: text.slice(0, 8000),
    lines,
    doubtful: [],
    excluded: [],
    parserModel: "csv-fixed-5col-v1",
    notes: `CSV 5 colonne fisse (Data|Valuta|Uscite|Entrate|Causale): ${lines.length} voci, nessuna esclusa.`,
  };
}
