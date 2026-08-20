import { createHash } from "crypto";
import {
  parseBankStatementCsv,
  type ParsedBankCsvLine,
} from "@/lib/amministrazione/bank-csv-parse";
import { scoreBankInvoiceMatch } from "@/lib/amministrazione/bank-reconcile";
import {
  BANK_STATEMENTS_BUCKET,
  bankCsvStoragePath,
  bankPdfStoragePath,
} from "@/lib/amministrazione/bank-statement-storage";
import type { createClient } from "@/lib/supabase/server";

type Supabase = Awaited<ReturnType<typeof createClient>>;

export const BANK_CONTEXT_BEFORE = 5;
export const BANK_CONTEXT_AFTER = 3;

export type BankLineWorkState = {
  amount: number;
  signNeedsReview?: boolean;
  match?: {
    invoiceId: string;
    matchScore: number;
    status: "auto_matched" | "manually_verified" | "discrepancy";
  } | null;
};

export type BankLineWorkStateMap = Record<string, BankLineWorkState>;

export type BankPdfImportTotals = {
  countIncassi: number;
  countUscite: number;
  totaleIncassi: number;
  totaleUscite: number;
  /** Incassi − uscite (con segno). */
  totaleNetto: number;
};

export type BankPdfImportResult = {
  batchId: string;
  rowsTotal: number;
  rowsImported: number;
  rowsSkipped: number;
  rowsMatched: number;
  rowsDoubtful: number;
  parserModel: string;
  notes: string;
  /** Range date preso dal file (min/max transactionDate). */
  dateFrom: string | null;
  dateTo: string | null;
  /** Totali sulle voci effettivamente caricate (nuove). */
  totalsImported: BankPdfImportTotals;
  /** Totali su tutte le voci rilevate nel file (incl. già presenti). */
  totalsDetected: BankPdfImportTotals;
  csvStoragePath: string;
  pdfStoragePath: string;
  pdfFileName: string;
};

export type BankContextTx = {
  id: string;
  transactionDate: string;
  valutaDate: string | null;
  amount: number;
  description: string;
  counterpartyName: string;
  accountName: string;
};

export type BankCsvPreviewResult = {
  lines: ParsedBankCsvLine[];
  dateFrom: string | null;
  dateTo: string | null;
  notes: string;
  parserModel: string;
  totalsDetected: BankPdfImportTotals;
  contextBefore: BankContextTx[];
  contextAfter: BankContextTx[];
  contextAfterHasMore: boolean;
};

function emptyTotals(): BankPdfImportTotals {
  return {
    countIncassi: 0,
    countUscite: 0,
    totaleIncassi: 0,
    totaleUscite: 0,
    totaleNetto: 0,
  };
}

function accumulateTotals(t: BankPdfImportTotals, amount: number): void {
  if (amount > 0) {
    t.countIncassi += 1;
    t.totaleIncassi += amount;
  } else if (amount < 0) {
    t.countUscite += 1;
    t.totaleUscite += Math.abs(amount);
  }
  t.totaleNetto = t.totaleIncassi - t.totaleUscite;
}

function roundTotals(t: BankPdfImportTotals): void {
  t.totaleIncassi = Math.round(t.totaleIncassi * 100) / 100;
  t.totaleUscite = Math.round(t.totaleUscite * 100) / 100;
  t.totaleNetto = Math.round(t.totaleNetto * 100) / 100;
}

function dateRangeFromLines(lines: ParsedBankCsvLine[]): {
  dateFrom: string | null;
  dateTo: string | null;
} {
  const dates = lines
    .map((l) => l.transactionDate)
    .filter((d) => /^\d{4}-\d{2}-\d{2}$/.test(d) && d !== "1970-01-01")
    .sort();
  return {
    dateFrom: dates[0] ?? null,
    dateTo: dates[dates.length - 1] ?? null,
  };
}

/** Hash univoco per riga CSV (include indice → nessuna riga gemella saltata). */
function hashCsvLine(fileSha: string, line: ParsedBankCsvLine): string {
  const r = line.csvRaw;
  const base = [
    fileSha,
    String(r.rowIndex),
    r.dataRaw,
    r.valutaRaw,
    r.uscitaRaw,
    r.entrataRaw,
    r.causaleRaw,
  ].join("|");
  return createHash("sha256").update(base).digest("hex").slice(0, 40);
}

function mapContextRow(row: {
  id: string;
  transaction_date: string;
  valuta_date: string | null;
  amount: number;
  description: string;
  counterparty_name: string;
  account_name: string;
}): BankContextTx {
  return {
    id: String(row.id),
    transactionDate: row.transaction_date,
    valutaDate: row.valuta_date,
    amount: Number(row.amount) || 0,
    description: String(row.description ?? ""),
    counterpartyName: String(row.counterparty_name ?? ""),
    accountName: String(row.account_name ?? ""),
  };
}

/** Righe già in DB prima/dopo il range del CSV (continuità “vetro”). */
export async function loadBankImportContext(input: {
  supabase: Supabase;
  dateFrom: string | null;
  dateTo: string | null;
  beforeLimit?: number;
  afterLimit?: number;
}): Promise<{
  contextBefore: BankContextTx[];
  contextAfter: BankContextTx[];
  contextAfterHasMore: boolean;
}> {
  const beforeLimit = input.beforeLimit ?? BANK_CONTEXT_BEFORE;
  const afterLimit = input.afterLimit ?? BANK_CONTEXT_AFTER;
  const contextBefore: BankContextTx[] = [];
  const contextAfter: BankContextTx[] = [];
  let contextAfterHasMore = false;

  if (input.dateFrom) {
    const { data } = await input.supabase
      .from("bank_transactions")
      .select(
        "id, transaction_date, valuta_date, amount, description, counterparty_name, account_name"
      )
      .is("deleted_at", null)
      .lt("transaction_date", input.dateFrom)
      .order("transaction_date", { ascending: false })
      .order("created_at", { ascending: false })
      .limit(beforeLimit);
    const rows = (data ?? []).map(mapContextRow);
    contextBefore.push(...rows.reverse());
  }

  if (input.dateTo) {
    const { data } = await input.supabase
      .from("bank_transactions")
      .select(
        "id, transaction_date, valuta_date, amount, description, counterparty_name, account_name"
      )
      .is("deleted_at", null)
      .gt("transaction_date", input.dateTo)
      .order("transaction_date", { ascending: true })
      .order("created_at", { ascending: true })
      .limit(afterLimit + 1);
    const rows = (data ?? []).map(mapContextRow);
    if (rows.length > afterLimit) {
      contextAfterHasMore = true;
      contextAfter.push(...rows.slice(0, afterLimit));
    } else {
      contextAfter.push(...rows);
    }
  }

  return { contextBefore, contextAfter, contextAfterHasMore };
}

/** Solo parsing + contesto DB: nessun insert. */
export async function previewBankStatementCsv(input: {
  supabase: Supabase;
  buffer: Buffer;
}): Promise<BankCsvPreviewResult> {
  const parsed = parseBankStatementCsv(input.buffer);
  const { dateFrom, dateTo } = dateRangeFromLines(parsed.lines);
  const totalsDetected = emptyTotals();
  for (const line of parsed.lines) accumulateTotals(totalsDetected, line.amount);
  roundTotals(totalsDetected);

  const ctx = await loadBankImportContext({
    supabase: input.supabase,
    dateFrom,
    dateTo,
  });

  return {
    lines: parsed.lines,
    dateFrom,
    dateTo,
    notes: parsed.notes,
    parserModel: parsed.parserModel,
    totalsDetected,
    ...ctx,
  };
}

/**
 * Salva CSV + PDF originali collegati allo stesso lotto, poi i movimenti
 * selezionati (keepRowIndices). Nessun salvataggio senza entrambi i file.
 */
export async function saveBankStatementImport(input: {
  supabase: Supabase;
  userId: string | null;
  csvFileName: string;
  csvBuffer: Buffer;
  pdfFileName: string;
  pdfBuffer: Buffer;
  accountName?: string;
  /** Indici csvRaw.rowIndex da tenere; se null → tutte le righe. */
  keepRowIndices?: number[] | null;
  /** Stato lavoro anteprima (importo/segno/match) per riga. */
  lineWork?: BankLineWorkStateMap;
}): Promise<BankPdfImportResult> {
  if (!input.pdfBuffer?.length) {
    throw new Error("PDF originale della banca obbligatorio per il salvataggio.");
  }
  if (!input.csvBuffer?.length) {
    throw new Error("File CSV obbligatorio per il salvataggio.");
  }

  const fileSha = createHash("sha256").update(input.csvBuffer).digest("hex");
  const pdfSha = createHash("sha256").update(input.pdfBuffer).digest("hex");
  const parsed = parseBankStatementCsv(input.csvBuffer);
  const keep =
    input.keepRowIndices == null
      ? null
      : new Set(input.keepRowIndices.map((n) => Number(n)));
  const lines: ParsedBankCsvLine[] =
    keep == null
      ? parsed.lines
      : parsed.lines.filter((l) => keep.has(l.csvRaw.rowIndex));

  if (lines.length === 0) {
    throw new Error("Nessuna riga da salvare: seleziona almeno un movimento.");
  }

  const accountName = input.accountName?.trim() || "BCC Don Rizzo";
  const { dateFrom, dateTo } = dateRangeFromLines(lines);
  const parseNotes = `${parsed.notes} | Righe tenute ${lines.length}/${parsed.lines.length}`;
  const fileText = input.csvBuffer.toString("utf8");

  const { data: batch, error: batchErr } = await input.supabase
    .from("bank_import_batches")
    .insert({
      file_name: input.csvFileName,
      file_sha256: fileSha,
      source_type: "csv",
      documento_stato: "bozza",
      account_name: accountName,
      rows_total: lines.length,
      parse_notes: parseNotes,
      raw_text_excerpt: parsed.text.slice(0, 8000),
      file_content: fileText.slice(0, 2_000_000),
      file_content_bytes: input.csvBuffer.length,
      pdf_file_name: input.pdfFileName,
      pdf_sha256: pdfSha,
      pdf_bytes: input.pdfBuffer.length,
      parser_model: parsed.parserModel,
      created_by: input.userId,
      updated_by: input.userId,
    })
    .select("id")
    .single();

  if (batchErr || !batch) {
    throw new Error(batchErr?.message ?? "Impossibile creare lotto import.");
  }

  const batchId = String(batch.id);
  const csvPath = bankCsvStoragePath(batchId, input.csvFileName);
  const pdfPath = bankPdfStoragePath(batchId, input.pdfFileName);

  const { error: csvUpErr } = await input.supabase.storage
    .from(BANK_STATEMENTS_BUCKET)
    .upload(csvPath, input.csvBuffer, {
      contentType: "text/csv",
      upsert: true,
    });
  if (csvUpErr) {
    throw new Error(`Upload CSV Storage: ${csvUpErr.message}`);
  }

  const { error: pdfUpErr } = await input.supabase.storage
    .from(BANK_STATEMENTS_BUCKET)
    .upload(pdfPath, input.pdfBuffer, {
      contentType: "application/pdf",
      upsert: true,
    });
  if (pdfUpErr) {
    throw new Error(`Upload PDF Storage: ${pdfUpErr.message}`);
  }

  await input.supabase
    .from("bank_import_batches")
    .update({
      csv_storage_path: csvPath,
      pdf_storage_path: pdfPath,
      updated_by: input.userId,
    })
    .eq("id", batchId);

  const { data: invoices } = await input.supabase
    .from("fic_invoices")
    .select(
      "id, fic_id, type, number, entity_name, entity_vat, amount_gross, date, status"
    )
    .is("deleted_at", null);

  type Inv = {
    id: string;
    fic_id: number;
    type: string;
    number: string;
    entity_name: string;
    amount_gross: number;
    date: string | null;
    status: string;
  };
  const invRows = (invoices ?? []) as Inv[];

  let rowsImported = 0;
  let rowsSkipped = 0;
  let rowsMatched = 0;
  const totalsImported = emptyTotals();
  const totalsDetected = emptyTotals();
  const insertErrors: string[] = [];

  for (const line of lines) {
    const work = input.lineWork?.[String(line.csvRaw.rowIndex)];
    const amount = work?.amount ?? line.amount;
    const signNeedsReview = Boolean(work?.signNeedsReview);
    accumulateTotals(totalsDetected, amount);
    const hash = hashCsvLine(fileSha, line);
    const ficPaymentId = `bank_csv:${hash}`;

    const { data: byHash } = await input.supabase
      .from("bank_transactions")
      .select("id")
      .eq("line_hash", hash)
      .is("deleted_at", null)
      .maybeSingle();
    if (byHash?.id) {
      rowsSkipped += 1;
      continue;
    }
    const { data: byFic } = await input.supabase
      .from("bank_transactions")
      .select("id")
      .eq("fic_payment_id", ficPaymentId)
      .is("deleted_at", null)
      .maybeSingle();
    if (byFic?.id) {
      rowsSkipped += 1;
      continue;
    }

    const raw = line.csvRaw;
    const { data: inserted, error } = await input.supabase
      .from("bank_transactions")
      .insert({
        fic_payment_id: ficPaymentId,
        account_name: accountName,
        transaction_date: line.transactionDate,
        valuta_date: line.valutaDate,
        amount,
        description: line.description,
        counterparty_name: line.counterpartyName,
        counterparty_vat: "",
        raw_data: {
          source: "bank_csv",
          parser: "local-fixed-5col",
          openai: false,
          file_name: input.csvFileName,
          file_sha256: fileSha,
          pdf_file_name: input.pdfFileName,
          pdf_sha256: pdfSha,
          line_hash: hash,
          row_index: raw.rowIndex,
          col1_data: raw.dataRaw,
          col2_valuta: raw.valutaRaw,
          col3_uscite: raw.uscitaRaw,
          col4_entrate: raw.entrataRaw,
          col5_causale: raw.causaleRaw,
          column: line.column ?? null,
          sign_source: line.signSource ?? null,
          amount_it: line.amountIt ?? null,
          work_session: work
            ? {
                amount: work.amount,
                signNeedsReview: work.signNeedsReview ?? false,
                matchInvoiceId: work.match?.invoiceId ?? null,
              }
            : null,
        },
        source: "bank_csv",
        import_batch_id: batchId,
        line_hash: hash,
        sign_needs_review: signNeedsReview,
        created_by: input.userId,
        updated_by: input.userId,
      })
      .select("id")
      .single();

    if (error || !inserted) {
      rowsSkipped += 1;
      insertErrors.push(
        `riga ${raw.rowIndex + 1}: ${error?.message ?? "insert fallito"}`
      );
      continue;
    }
    rowsImported += 1;
    accumulateTotals(totalsImported, amount);

    // Preferisci match deciso in sessione di lavoro; altrimenti auto-match
    let chosen: { invoiceId: string; score: number; status: string } | null =
      null;
    if (work?.match?.invoiceId) {
      chosen = {
        invoiceId: work.match.invoiceId,
        score: work.match.matchScore,
        status: work.match.status,
      };
    } else {
      let best: { inv: Inv; score: number } | null = null;
      for (const inv of invRows) {
        const score = scoreBankInvoiceMatch({
          amount,
          invoiceGross: Number(inv.amount_gross) || 0,
          counterparty: line.counterpartyName,
          entityName: String(inv.entity_name ?? ""),
          description: line.description,
          invoiceNumber: String(inv.number ?? ""),
          txDate: line.transactionDate,
          invoiceDate: inv.date,
        });
        if (score >= 55 && (!best || score > best.score)) {
          best = { inv, score };
        }
      }
      if (best) {
        chosen = {
          invoiceId: best.inv.id,
          score: best.score,
          status: "auto_matched",
        };
      }
    }

    if (chosen) {
      const { error: matchErr } = await input.supabase
        .from("bank_invoice_matches")
        .insert({
          transaction_id: inserted.id,
          invoice_id: chosen.invoiceId,
          match_score: chosen.score,
          status: chosen.status,
          verified_at:
            chosen.status === "manually_verified"
              ? new Date().toISOString()
              : null,
          created_by: input.userId,
          updated_by: input.userId,
        });
      if (!matchErr) {
        rowsMatched += 1;
        const inv = invRows.find((i) => i.id === chosen!.invoiceId);
        const strongSign =
          line.signSource === "csv-col3-uscita" ||
          line.signSource === "csv-col4-entrata";
        if (strongSign && inv && inv.status !== "paid") {
          await input.supabase
            .from("fic_invoices")
            .update({ status: "paid", updated_by: input.userId })
            .eq("id", chosen.invoiceId)
            .is("deleted_at", null);
        }
      }
    }
  }

  await input.supabase
    .from("bank_import_batches")
    .update({
      rows_imported: rowsImported,
      rows_skipped: rowsSkipped,
      rows_matched: rowsMatched,
      documento_stato: rowsImported > 0 ? "processato" : "errore",
      parse_notes: [
        parseNotes,
        `PDF:${input.pdfFileName}`,
        insertErrors.length
          ? `Errori insert: ${insertErrors.slice(0, 5).join(" | ")}`
          : null,
      ]
        .filter(Boolean)
        .join(" "),
      updated_by: input.userId,
    })
    .eq("id", batchId);

  roundTotals(totalsImported);
  roundTotals(totalsDetected);

  return {
    batchId,
    rowsTotal: lines.length,
    rowsImported,
    rowsSkipped,
    rowsMatched,
    rowsDoubtful: 0,
    parserModel: parsed.parserModel,
    notes: [
      parsed.notes,
      `PDF collegato: ${input.pdfFileName}`,
      insertErrors.length ? `Errori: ${insertErrors.length}` : null,
    ]
      .filter(Boolean)
      .join(" "),
    dateFrom,
    dateTo,
    totalsImported,
    totalsDetected,
    csvStoragePath: csvPath,
    pdfStoragePath: pdfPath,
    pdfFileName: input.pdfFileName,
  };
}

/**
 * @deprecated Preferire preview + saveBankStatementImport.
 * Mantenuto per compatibilità azioni legacy PDF deterministico.
 */
export async function importBankStatementPdf(input: {
  supabase: Supabase;
  userId: string | null;
  fileName: string;
  buffer: Buffer;
  accountName?: string;
}): Promise<BankPdfImportResult> {
  // Legacy: senza PDF non può più salvare in produzione — richiede PDF vuoto stub?
  // Meglio fallire chiaro.
  throw new Error(
    "Usa il flusso Anteprima → Salva nel DB (CSV + PDF originale obbligatori)."
  );
}
