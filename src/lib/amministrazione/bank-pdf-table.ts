/**
 * Estrazione TABELLA estratto conto via coordinate PDF (pdfjs).
 * Colonne Mov.DARE / Mov.AVERE determinate dalla posizione X, non dal testo piatto.
 */
import type { ParsedBankLine } from "@/lib/amministrazione/bank-pdf-parse";
import {
  parseItAmount,
  IT_AMOUNT_RE,
} from "@/lib/amministrazione/bank-pdf-parse";

type TextItem = { str: string; x: number; y: number; w: number };

type ColumnLayout = {
  dareX: number | null;
  avereX: number | null;
  saldoX: number | null;
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

function clusterRows(items: TextItem[], yTol = 3.2): TextItem[][] {
  const sorted = [...items].sort((a, b) => b.y - a.y || a.x - b.x);
  const rows: TextItem[][] = [];
  for (const it of sorted) {
    const row = rows.find((r) => Math.abs(r[0].y - it.y) <= yTol);
    if (row) row.push(it);
    else rows.push([it]);
  }
  for (const r of rows) r.sort((a, b) => a.x - b.x);
  return rows;
}

function detectColumns(items: TextItem[]): ColumnLayout {
  let dareX: number | null = null;
  let avereX: number | null = null;
  let saldoX: number | null = null;

  for (const it of items) {
    const t = it.str.replace(/\s+/g, "").toLowerCase();
    if (/mov\.?dare|^dare$/.test(t) || t === "dare") {
      dareX = it.x;
    } else if (/mov\.?avere|^avere$/.test(t) || t === "avere") {
      avereX = it.x;
    } else if (/^saldo/.test(t)) {
      saldoX = it.x;
    }
  }

  // Header spezzato: "Mov." + "DARE"
  if (dareX == null || avereX == null) {
    for (let i = 0; i < items.length; i++) {
      const a = items[i].str.toLowerCase();
      const b = items[i + 1]?.str.toLowerCase() ?? "";
      if (/mov/.test(a) && /^dare/.test(b)) dareX = items[i + 1].x;
      if (/mov/.test(a) && /^avere/.test(b)) avereX = items[i + 1].x;
    }
  }

  return { dareX, avereX, saldoX };
}

function nearestColumn(
  x: number,
  layout: ColumnLayout
): "DARE" | "AVERE" | "SALDO" | null {
  const candidates: Array<{ k: "DARE" | "AVERE" | "SALDO"; x: number }> = [];
  if (layout.dareX != null) candidates.push({ k: "DARE", x: layout.dareX });
  if (layout.avereX != null) candidates.push({ k: "AVERE", x: layout.avereX });
  if (layout.saldoX != null) candidates.push({ k: "SALDO", x: layout.saldoX });
  if (!candidates.length) return null;

  let best = candidates[0];
  let bestDist = Math.abs(x - best.x);
  for (const c of candidates.slice(1)) {
    const d = Math.abs(x - c.x);
    if (d < bestDist) {
      best = c;
      bestDist = d;
    }
  }
  // Se troppo lontano da tutte le colonne importo, ignora
  if (bestDist > 80) return null;
  return best.k;
}

function rowText(items: TextItem[]): string {
  return items
    .map((i) => i.str)
    .join(" ")
    .replace(/\s+/g, " ")
    .trim();
}

function extractAmountsFromRow(
  items: TextItem[],
  layout: ColumnLayout
): Array<{ amountIt: string; column: "DARE" | "AVERE"; x: number }> {
  const out: Array<{ amountIt: string; column: "DARE" | "AVERE"; x: number }> =
    [];
  for (const it of items) {
    const m = it.str.match(IT_AMOUNT_RE);
    if (!m) continue;
    for (const tok of m) {
      const col = nearestColumn(it.x, layout);
      if (col === "DARE" || col === "AVERE") {
        out.push({ amountIt: tok, column: col, x: it.x });
      }
      // SALDO ignorato
    }
  }
  return out;
}

async function loadPdfJs() {
  // Legacy build per Node/server
  const pdfjs = await import("pdfjs-dist/legacy/build/pdf.mjs");
  return pdfjs;
}

export type BankTableExtractResult = {
  lines: ParsedBankLine[];
  markdownTable: string;
  pageCount: number;
  layoutFound: boolean;
  notes: string;
};

/**
 * Legge il PDF come TABELLA: ogni importo va in DARE o AVERE in base alla colonna X.
 */
export async function extractBankTableFromPdf(
  buffer: Buffer
): Promise<BankTableExtractResult> {
  const pdfjs = await loadPdfJs();
  const data = new Uint8Array(buffer);
  const doc = await pdfjs.getDocument({ data, useSystemFonts: true }).promise;

  let layout: ColumnLayout = { dareX: null, avereX: null, saldoX: null };
  let layoutFound = false;
  const lines: ParsedBankLine[] = [];
  const mdRows: string[] = [
    "| data | valuta | descrizione | dare | avere |",
    "|---|---|---|---|---|",
  ];

  for (let p = 1; p <= doc.numPages; p++) {
    const page = await doc.getPage(p);
    const content = await page.getTextContent();
    const items: TextItem[] = [];
    for (const raw of content.items) {
      if (!raw || typeof raw !== "object" || !("str" in raw)) continue;
      const it = raw as {
        str: string;
        transform: number[];
        width?: number;
      };
      const str = String(it.str ?? "").trim();
      if (!str) continue;
      const x = Number(it.transform?.[4] ?? 0);
      const y = Number(it.transform?.[5] ?? 0);
      items.push({ str, x, y, w: Number(it.width ?? 0) });
    }

    const pageLayout = detectColumns(items);
    if (pageLayout.dareX != null || pageLayout.avereX != null) {
      layout = {
        dareX: pageLayout.dareX ?? layout.dareX,
        avereX: pageLayout.avereX ?? layout.avereX,
        saldoX: pageLayout.saldoX ?? layout.saldoX,
      };
      layoutFound = layout.dareX != null && layout.avereX != null;
    }

    const rows = clusterRows(items);
    for (const row of rows) {
      const text = rowText(row);
      if (!text) continue;
      if (/\b(saldo|totale|totali|pagina|estratto|iban)\b/i.test(text) &&
        !/\d{1,2}[\/\-.]\d{1,2}[\/\-.]\d{2,4}/.test(text)) {
        continue;
      }
      if (/mov\.?\s*dare|mov\.?\s*avere/i.test(text) && !/\d+,\d{2}/.test(text)) {
        continue;
      }

      const dates = [...text.matchAll(/(\d{1,2}[\/\-.]\d{1,2}[\/\-.]\d{2,4})/g)].map(
        (m) => m[1]
      );
      if (!dates.length) continue;
      const txDate = toIsoFromIt(dates[0]);
      if (!txDate) continue;
      const valutaDate = dates[1] ? toIsoFromIt(dates[1]) : txDate;

      let amounts = extractAmountsFromRow(row, layout);

      // Fallback senza layout: se 1 importo → DARE; se 2 → primo DARE secondo AVERE (no saldo)
      if (!amounts.length) {
        const toks = [...text.matchAll(IT_AMOUNT_RE)].map((m) => m[0]);
        if (toks.length === 1) {
          amounts = [{ amountIt: toks[0], column: "DARE", x: 0 }];
        } else if (toks.length === 2 && layoutFound) {
          // con layout mancante sulla riga ma header noto: non usare saldo
          amounts = [
            { amountIt: toks[0], column: "DARE", x: 0 },
            { amountIt: toks[1], column: "AVERE", x: 1 },
          ];
        } else if (toks.length >= 2) {
          // tipico: movimento + saldo → solo primo come DARE se non sappiamo
          amounts = [{ amountIt: toks[0], column: "DARE", x: 0 }];
        }
      }

      if (!amounts.length) continue;

      let description = text
        .replace(/(\d{1,2}[\/\-.]\d{1,2}[\/\-.]\d{2,4})/g, " ")
        .replace(IT_AMOUNT_RE, " ")
        .replace(/mov\.?\s*dare|mov\.?\s*avere/gi, " ")
        .replace(/\s+/g, " ")
        .trim();

      const dareTok = amounts.find((a) => a.column === "DARE")?.amountIt ?? "";
      const avereTok =
        amounts.find((a) => a.column === "AVERE")?.amountIt ?? "";
      mdRows.push(
        `| ${dates[0]} | ${dates[1] ?? ""} | ${description.slice(0, 80)} | ${dareTok} | ${avereTok} |`
      );

      for (const a of amounts) {
        const n = parseItAmount(a.amountIt, { strict: true });
        if (n == null || n === 0) continue;
        const signed = a.column === "AVERE" ? Math.abs(n) : -Math.abs(n);
        lines.push({
          transactionDate: txDate,
          valutaDate,
          amount: signed,
          description:
            description ||
            (a.column === "AVERE" ? "Mov.AVERE" : "Mov.DARE"),
          counterpartyName: "",
          trnOrCro: "",
          column: a.column,
          signSource: "pdfjs-table-column",
          amountIt: a.amountIt,
        });
      }
    }
  }

  const seen = new Set<string>();
  const unique = lines.filter((l) => {
    const key = `${l.transactionDate}|${l.amount}|${l.description.slice(0, 80)}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });

  return {
    lines: unique,
    markdownTable: mdRows.join("\n"),
    pageCount: doc.numPages,
    layoutFound,
    notes: layoutFound
      ? `Tabella PDF: colonne DARE/AVERE rilevate (${unique.length} voci).`
      : `Tabella PDF: layout colonne parziale/assente (${unique.length} voci).`,
  };
}
