import { createHash } from "crypto";
import {
  parseBankStatementCsv,
  type ParsedBankCsvLine,
} from "@/lib/amministrazione/bank-csv-parse";
import { scoreBankInvoiceMatch } from "@/lib/amministrazione/bank-reconcile";
import type { createClient } from "@/lib/supabase/server";

type Supabase = Awaited<ReturnType<typeof createClient>>;

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

export async function importBankStatementPdf(input: {
  supabase: Supabase;
  userId: string | null;
  fileName: string;
  buffer: Buffer;
  accountName?: string;
}): Promise<BankPdfImportResult> {
  const fileSha = createHash("sha256").update(input.buffer).digest("hex");
  // Locale: nessuna chiamata OpenAI — legge ogni campo del CSV
  const parsed = parseBankStatementCsv(input.buffer);
  const accountName = input.accountName?.trim() || "BCC Don Rizzo";

  const dates = parsed.lines
    .map((l) => l.transactionDate)
    .filter((d) => /^\d{4}-\d{2}-\d{2}$/.test(d) && d !== "1970-01-01")
    .sort();
  const pdfDateFrom = dates[0] ?? null;
  const pdfDateTo = dates[dates.length - 1] ?? null;

  const parseNotes = parsed.notes;

  const fileText = input.buffer.toString("utf8");
  let batch: { id: string } | null = null;
  {
    const first = await input.supabase
      .from("bank_import_batches")
      .insert({
        file_name: input.fileName,
        file_sha256: fileSha,
        source_type: "csv",
        documento_stato: parsed.lines.length ? "processato" : "errore",
        account_name: accountName,
        rows_total: parsed.lines.length,
        parse_notes: parseNotes,
        raw_text_excerpt: parsed.text.slice(0, 8000),
        file_content: fileText.slice(0, 2_000_000),
        file_content_bytes: input.buffer.length,
        parser_model: parsed.parserModel,
        created_by: input.userId,
        updated_by: input.userId,
      })
      .select("id")
      .single();
    if (first.error && /file_content/i.test(first.error.message)) {
      // Colonne non ancora migrate: salva comunque lotto + excerpt
      const fallback = await input.supabase
        .from("bank_import_batches")
        .insert({
          file_name: input.fileName,
          file_sha256: fileSha,
          source_type: "csv",
          documento_stato: parsed.lines.length ? "processato" : "errore",
          account_name: accountName,
          rows_total: parsed.lines.length,
          parse_notes: `${parseNotes} | CSV bytes=${input.buffer.length}`,
          raw_text_excerpt: fileText.slice(0, 8000),
          parser_model: parsed.parserModel,
          created_by: input.userId,
          updated_by: input.userId,
        })
        .select("id")
        .single();
      if (fallback.error || !fallback.data) {
        throw new Error(
          fallback.error?.message ?? "Impossibile creare lotto import."
        );
      }
      batch = fallback.data;
    } else if (first.error || !first.data) {
      throw new Error(first.error?.message ?? "Impossibile creare lotto import.");
    } else {
      batch = first.data;
    }
  }

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

  for (const line of parsed.lines) {
    accumulateTotals(totalsDetected, line.amount);
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
        amount: line.amount,
        description: line.description,
        counterparty_name: line.counterpartyName,
        counterparty_vat: "",
        raw_data: {
          source: "bank_csv",
          parser: "local-fixed-5col",
          openai: false,
          file_name: input.fileName,
          file_sha256: fileSha,
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
        },
        source: "bank_csv",
        import_batch_id: batch.id,
        line_hash: hash,
        sign_needs_review: false,
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
    accumulateTotals(totalsImported, line.amount);

    let best: { inv: Inv; score: number } | null = null;
    for (const inv of invRows) {
      const score = scoreBankInvoiceMatch({
        amount: line.amount,
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
      const status = "auto_matched";
      const { error: matchErr } = await input.supabase
        .from("bank_invoice_matches")
        .insert({
          transaction_id: inserted.id,
          invoice_id: best.inv.id,
          match_score: best.score,
          status,
          created_by: input.userId,
          updated_by: input.userId,
        });
      if (!matchErr) {
        rowsMatched += 1;
        const strongSign =
          line.signSource === "csv-col3-uscita" ||
          line.signSource === "csv-col4-entrata";
        if (strongSign && best.inv.status !== "paid") {
          await input.supabase
            .from("fic_invoices")
            .update({ status: "paid", updated_by: input.userId })
            .eq("id", best.inv.id)
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
        insertErrors.length
          ? `Errori insert: ${insertErrors.slice(0, 5).join(" | ")}`
          : null,
      ]
        .filter(Boolean)
        .join(" "),
      updated_by: input.userId,
    })
    .eq("id", batch.id);

  for (const t of [totalsImported, totalsDetected]) {
    t.totaleIncassi = Math.round(t.totaleIncassi * 100) / 100;
    t.totaleUscite = Math.round(t.totaleUscite * 100) / 100;
    t.totaleNetto = Math.round(t.totaleNetto * 100) / 100;
  }

  return {
    batchId: String(batch.id),
    rowsTotal: parsed.lines.length,
    rowsImported,
    rowsSkipped,
    rowsMatched,
    rowsDoubtful: 0,
    parserModel: parsed.parserModel,
    notes: [
      parsed.notes,
      insertErrors.length ? `Errori: ${insertErrors.length}` : null,
    ]
      .filter(Boolean)
      .join(" "),
    dateFrom: pdfDateFrom,
    dateTo: pdfDateTo,
    totalsImported,
    totalsDetected,
  };
}
