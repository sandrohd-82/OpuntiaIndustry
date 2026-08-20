import { createHash } from "crypto";
import {
  hashBankLine,
  parseBankStatementPdf,
  type ParsedBankLine,
} from "@/lib/amministrazione/bank-pdf-parse";
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
  /** Range date preso dal PDF (min/max transactionDate). */
  dateFrom: string | null;
  dateTo: string | null;
  /** Totali sulle voci effettivamente caricate (nuove). */
  totalsImported: BankPdfImportTotals;
  /** Totali su tutte le voci rilevate nel PDF (incl. già presenti). */
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

function accumulateTotals(
  t: BankPdfImportTotals,
  amount: number
): void {
  if (amount > 0) {
    t.countIncassi += 1;
    t.totaleIncassi += amount;
  } else if (amount < 0) {
    t.countUscite += 1;
    t.totaleUscite += Math.abs(amount);
  }
  t.totaleNetto = t.totaleIncassi - t.totaleUscite;
}

function scoreMatch(input: {
  amount: number;
  invoiceGross: number;
  counterparty: string;
  entityName: string;
  description: string;
  invoiceNumber: string;
  txDate: string | null;
  invoiceDate: string | null;
}): number {
  let score = 0;
  const absTx = Math.abs(input.amount);
  const absInv = Math.abs(input.invoiceGross);
  const diff = Math.abs(absTx - absInv);
  if (diff <= 0.01) score += 55;
  else if (diff <= 1) score += 35;
  else if (diff <= 5) score += 15;
  else return 0;

  const nTx = input.counterparty
    .normalize("NFD")
    .replace(/\p{M}/gu, "")
    .toLowerCase();
  const nEnt = input.entityName
    .normalize("NFD")
    .replace(/\p{M}/gu, "")
    .toLowerCase();
  if (nTx && nEnt && (nTx.includes(nEnt) || nEnt.includes(nTx))) score += 25;

  const desc = input.description.toLowerCase();
  const num = input.invoiceNumber.replace(/\s+/g, "").toLowerCase();
  if (num && desc.includes(num.replace(/\//g, ""))) score += 15;

  if (input.txDate && input.invoiceDate) {
    const d1 = Date.parse(input.txDate);
    const d2 = Date.parse(input.invoiceDate);
    if (Number.isFinite(d1) && Number.isFinite(d2)) {
      const days = Math.abs(d1 - d2) / 86_400_000;
      if (days <= 3) score += 10;
      else if (days <= 15) score += 5;
    }
  }
  return Math.min(100, score);
}

export async function importBankStatementPdf(input: {
  supabase: Supabase;
  userId: string | null;
  fileName: string;
  buffer: Buffer;
  accountName?: string;
}): Promise<BankPdfImportResult> {
  const fileSha = createHash("sha256").update(input.buffer).digest("hex");
  const parsed = await parseBankStatementPdf(input.buffer);
  const accountName = input.accountName?.trim() || "BCC Don Rizzo";

  const dates = parsed.lines
    .map((l) => l.transactionDate)
    .filter((d) => /^\d{4}-\d{2}-\d{2}$/.test(d))
    .sort();
  const pdfDateFrom = dates[0] ?? null;
  const pdfDateTo = dates[dates.length - 1] ?? null;

  const rowsDoubtful = parsed.doubtful.length;
  const parseNotes = [
    parsed.notes,
    rowsDoubtful
      ? `Da confermare segno (+/−): ${parsed.doubtful
          .slice(0, 8)
          .map((d) => `${d.description.slice(0, 40)}… (${d.reason})`)
          .join(" | ")}`
      : null,
  ]
    .filter(Boolean)
    .join(" ");

  const { data: batch, error: batchErr } = await input.supabase
    .from("bank_import_batches")
    .insert({
      file_name: input.fileName,
      file_sha256: fileSha,
      source_type: "pdf",
      documento_stato: parsed.lines.length ? "processato" : "errore",
      account_name: accountName,
      rows_total: parsed.lines.length,
      parse_notes: parseNotes,
      raw_text_excerpt: parsed.text.slice(0, 8000),
      parser_model: parsed.parserModel,
      created_by: input.userId,
      updated_by: input.userId,
    })
    .select("id")
    .single();
  if (batchErr || !batch) {
    throw new Error(batchErr?.message ?? "Impossibile creare lotto import.");
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

  for (const line of parsed.lines as ParsedBankLine[]) {
    accumulateTotals(totalsDetected, line.amount);
    const hash = hashBankLine(line);
    const ficPaymentId = `bank_pdf:${hash}`;

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
          source: "bank_pdf",
          trn_or_cro: line.trnOrCro,
          file_name: input.fileName,
          line_hash: hash,
          column: line.column ?? null,
          sign_source: line.signSource ?? null,
          amount_it: line.amountIt ?? null,
          sign_review_reason: line.signReviewReason ?? null,
        },
        source: "bank_pdf",
        import_batch_id: batch.id,
        line_hash: hash,
        sign_needs_review: Boolean(line.signNeedsReview),
        created_by: input.userId,
        updated_by: input.userId,
      })
      .select("id")
      .single();

    if (error || !inserted) {
      rowsSkipped += 1;
      continue;
    }
    rowsImported += 1;
    accumulateTotals(totalsImported, line.amount);

    let best: { inv: Inv; score: number } | null = null;
    for (const inv of invRows) {
      if (line.amount > 0 && inv.type !== "issued") continue;
      if (line.amount < 0 && inv.type !== "received") continue;
      const score = scoreMatch({
        amount: line.amount,
        invoiceGross: Number(inv.amount_gross),
        counterparty: line.counterpartyName,
        entityName: inv.entity_name,
        description: line.description,
        invoiceNumber: inv.number,
        txDate: line.transactionDate,
        invoiceDate: inv.date,
      });
      if (score < 40) continue;
      if (!best || score > best.score) best = { inv, score };
    }

    if (best) {
      const status =
        Math.abs(Math.abs(line.amount) - Math.abs(Number(best.inv.amount_gross))) >
        0.01
          ? "discrepancy"
          : "auto_matched";
      await input.supabase.from("bank_invoice_matches").insert({
        transaction_id: inserted.id,
        invoice_id: best.inv.id,
        match_score: best.score,
        status,
        created_by: input.userId,
      });
      rowsMatched += 1;
      // Non segnare fattura pagata se il segno è solo default/euristica debole
      const strongSign =
        line.signSource === "column-dare" ||
        line.signSource === "column-avere" ||
        line.signSource === "openai-dareIt" ||
        line.signSource === "openai-avereIt" ||
        line.signSource === "openai-uscitaCents" ||
        line.signSource === "openai-entrataCents" ||
        line.signSource === "openai-column" ||
        line.signSource === "causal-avere" ||
        line.signSource === "causal-dare" ||
        line.signSource === "force-storno" ||
        line.signSource === "force-bonifico-vs-favore" ||
        line.signSource === "force-interessi";
      if (
        status === "auto_matched" &&
        strongSign &&
        best.inv.status !== "paid"
      ) {
        await input.supabase
          .from("fic_invoices")
          .update({ status: "paid", updated_by: input.userId })
          .eq("id", best.inv.id)
          .is("deleted_at", null);
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
      updated_by: input.userId,
    })
    .eq("id", batch.id);

  // Arrotonda a 2 decimali per display/DB
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
    rowsDoubtful,
    parserModel: parsed.parserModel,
    notes: parseNotes,
    dateFrom: pdfDateFrom,
    dateTo: pdfDateTo,
    totalsImported,
    totalsDetected,
  };
}
