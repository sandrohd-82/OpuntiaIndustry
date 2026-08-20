import {
  parseItAmount,
  validateLines,
  type ParseBankStatementResult,
  type ParsedBankLine,
} from "@/lib/amministrazione/bank-pdf-parse";

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

function normalizeHeader(h: string): string {
  return h
    .replace(/^\uFEFF/, "")
    .normalize("NFD")
    .replace(/\p{M}/gu, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}

function detectDelimiter(headerLine: string): ";" | "," | "\t" {
  const counts = {
    ";": (headerLine.match(/;/g) ?? []).length,
    ",": (headerLine.match(/,/g) ?? []).length,
    "\t": (headerLine.match(/\t/g) ?? []).length,
  };
  const best = (Object.entries(counts) as Array<[";" | "," | "\t", number]>).sort(
    (a, b) => b[1] - a[1]
  )[0];
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

type ColMap = {
  data: number | null;
  valuta: number | null;
  dare: number | null;
  avere: number | null;
  importo: number | null;
  descrizione: number | null;
  controparte: number | null;
  cro: number | null;
};

function mapHeaders(headers: string[]): ColMap {
  const map: ColMap = {
    data: null,
    valuta: null,
    dare: null,
    avere: null,
    importo: null,
    descrizione: null,
    controparte: null,
    cro: null,
  };

  headers.forEach((h, idx) => {
    const n = normalizeHeader(h);
    if (!n) return;

    if (
      map.data == null &&
      (n === "data" ||
        n.includes("data esecuzione") ||
        n.includes("data contabile") ||
        n.includes("data operazione") ||
        n.includes("data movimento") ||
        n === "booking date" ||
        n === "transaction date")
    ) {
      if (!n.includes("valuta")) map.data = idx;
    }
    if (
      map.valuta == null &&
      (n.includes("data valuta") || n === "valuta" || n === "value date")
    ) {
      map.valuta = idx;
    }
    if (
      map.dare == null &&
      (n === "dare" ||
        n.includes("mov dare") ||
        n.includes("importo dare") ||
        n === "uscita" ||
        n.includes("addebito") ||
        n === "debit" ||
        n === "withdrawals")
    ) {
      map.dare = idx;
    }
    if (
      map.avere == null &&
      (n === "avere" ||
        n.includes("mov avere") ||
        n.includes("importo avere") ||
        n === "entrata" ||
        n.includes("accredito") ||
        n === "credit" ||
        n === "deposits")
    ) {
      map.avere = idx;
    }
    if (
      map.importo == null &&
      (n === "importo" || n === "amount" || n === "importo euro")
    ) {
      map.importo = idx;
    }
    if (
      map.descrizione == null &&
      (n.includes("descrizione") ||
        n.includes("causale") ||
        n.includes("dettaglio") ||
        n === "description" ||
        n === "narrative")
    ) {
      map.descrizione = idx;
    }
    if (
      map.controparte == null &&
      (n.includes("controparte") ||
        n.includes("beneficiario") ||
        n.includes("ordinante") ||
        n.includes("nome") ||
        n === "payee")
    ) {
      map.controparte = idx;
    }
    if (
      map.cro == null &&
      (n === "cro" || n === "trn" || n.includes("riferimento") || n === "id")
    ) {
      map.cro = idx;
    }
  });

  // Se "data" non trovata, prima colonna con pattern data nel nome
  if (map.data == null) {
    headers.forEach((h, idx) => {
      const n = normalizeHeader(h);
      if (map.data == null && n.startsWith("data") && !n.includes("valuta")) {
        map.data = idx;
      }
    });
  }

  return map;
}

function cell(row: string[], idx: number | null): string {
  if (idx == null || idx < 0 || idx >= row.length) return "";
  return String(row[idx] ?? "")
    .replace(/\u00A0/g, " ")
    .trim();
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

/**
 * Parsing estratto conto CSV (IT: `;` o `,`).
 * Colonne tipiche: Data, Data valuta, Dare, Avere, Descrizione.
 */
export function parseBankStatementCsv(
  buffer: Buffer
): ParseBankStatementResult {
  const text = decodeCsvBuffer(buffer);
  const linesRaw = text
    .split(/\r\n|\n|\r/)
    .map((l) => l.trimEnd())
    .filter((l) => l.trim().length > 0);

  if (linesRaw.length < 2) {
    return {
      text: text.slice(0, 4000),
      lines: [],
      doubtful: [],
      excluded: [],
      parserModel: "csv-v1",
      notes: "CSV vuoto o senza righe dati.",
    };
  }

  // Salta righe preambolo fino a trovare un header utile
  let headerIdx = 0;
  let delimiter: ";" | "," | "\t" = ";";
  let colMap: ColMap | null = null;
  for (let i = 0; i < Math.min(linesRaw.length, 30); i++) {
    const delim = detectDelimiter(linesRaw[i]!);
    const headers = splitCsvLine(linesRaw[i]!, delim);
    const mapped = mapHeaders(headers);
    const score =
      (mapped.data != null ? 2 : 0) +
      (mapped.dare != null || mapped.avere != null || mapped.importo != null
        ? 2
        : 0) +
      (mapped.descrizione != null ? 1 : 0);
    if (score >= 3) {
      headerIdx = i;
      delimiter = delim;
      colMap = mapped;
      break;
    }
  }

  if (!colMap || colMap.data == null) {
    return {
      text: text.slice(0, 4000),
      lines: [],
      doubtful: [],
      excluded: [],
      parserModel: "csv-v1",
      notes:
        "Intestazioni CSV non riconosciute. Serve almeno Data + (Dare/Avere oppure Importo) + Descrizione.",
    };
  }

  const rawLines: ParsedBankLine[] = [];
  for (let i = headerIdx + 1; i < linesRaw.length; i++) {
    const cols = splitCsvLine(linesRaw[i]!, delimiter);
    if (cols.every((c) => !c.trim())) continue;

    const txDate = parseBankDateIt(cell(cols, colMap.data));
    if (!txDate) continue;

    const valutaRaw = cell(cols, colMap.valuta);
    const valutaDate = valutaRaw ? parseBankDateIt(valutaRaw) : null;
    const description =
      cell(cols, colMap.descrizione) ||
      cell(cols, colMap.controparte) ||
      "Movimento CSV";
    const counterpartyName = cell(cols, colMap.controparte);
    const trnOrCro = cell(cols, colMap.cro);

    const dareRaw = cell(cols, colMap.dare);
    const avereRaw = cell(cols, colMap.avere);
    const importoRaw = cell(cols, colMap.importo);

    let column: "DARE" | "AVERE" | null = null;
    let amountIt = "";
    let amount = 0;
    let signSource = "csv";

    const dareAmt = dareRaw ? parseItAmount(dareRaw, { strict: false }) : null;
    const avereAmt = avereRaw
      ? parseItAmount(avereRaw, { strict: false })
      : null;

    if (dareAmt != null && dareAmt !== 0 && (avereAmt == null || avereAmt === 0)) {
      column = "DARE";
      amount = -Math.abs(dareAmt);
      amountIt = dareRaw;
      signSource = "csv-dare";
    } else if (
      avereAmt != null &&
      avereAmt !== 0 &&
      (dareAmt == null || dareAmt === 0)
    ) {
      column = "AVERE";
      amount = Math.abs(avereAmt);
      amountIt = avereRaw;
      signSource = "csv-avere";
    } else if (importoRaw) {
      const signed = parseItAmount(importoRaw, { strict: false });
      if (signed == null || signed === 0) continue;
      // Importo unico: segno dal valore (o da +/− esplicito già in parseItAmount)
      if (signed < 0 || /^-/.test(importoRaw.trim())) {
        column = "DARE";
        amount = -Math.abs(signed);
        signSource = "csv-importo-neg";
      } else if (/\+/.test(importoRaw) || signed > 0) {
        // Senza segno esplicito: dubbio se non c'è +
        if (/^\s*\+/.test(importoRaw) || /entrata|avere|accred/i.test(description)) {
          column = "AVERE";
          amount = Math.abs(signed);
          signSource = "csv-importo-pos";
        } else if (/uscita|dare|addeb|pagament/i.test(description)) {
          column = "DARE";
          amount = -Math.abs(signed);
          signSource = "csv-importo-desc";
        } else {
          column = null;
          amount = Math.abs(signed);
          signSource = "csv-importo-nocolumn";
        }
      }
      amountIt = importoRaw;
    } else {
      continue;
    }

    if (amount === 0) continue;

    rawLines.push({
      transactionDate: txDate,
      valutaDate,
      amount,
      description: description.slice(0, 2000),
      counterpartyName: counterpartyName.slice(0, 200),
      trnOrCro: trnOrCro.slice(0, 80),
      column,
      signSource,
      amountIt: amountIt || undefined,
    });
  }

  const validated = validateLines(rawLines);
  return {
    text: text.slice(0, 8000),
    lines: validated.lines,
    doubtful: validated.doubtful,
    excluded: validated.excluded,
    parserModel: "csv-v1",
    notes: [
      `CSV delimitatore «${delimiter === "\t" ? "TAB" : delimiter}»: ${validated.lines.length} voci.`,
      validated.doubtful.length
        ? `${validated.doubtful.length} con segno da confermare (+/−).`
        : null,
      validated.excluded.length
        ? `${validated.excluded.length} escluse (saldi/totali).`
        : null,
    ]
      .filter(Boolean)
      .join(" "),
  };
}
