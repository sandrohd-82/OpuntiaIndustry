"use server";

import { writeAuditLog } from "@/lib/audit";
import {
  previewBankStatementCsv,
  saveBankStatementImport,
  type BankLineWorkStateMap,
} from "@/lib/amministrazione/bank-import";
import {
  bankPdfRowsToCsv,
  parseBankPdfDeterministic,
} from "@/lib/amministrazione/bank-pdf-python";
import {
  BANK_RECONCILE_BROWSE_STEP_DAYS,
  BANK_RECONCILE_MIN_SCORE,
  BANK_RECONCILE_NEAR_DAYS,
  BANK_RECONCILE_SEARCH_DAYS,
  invoiceKindFromBankAmount,
  scoreBankInvoiceMatch,
  scoreEntityInCausale,
  isBankCommissionFee,
  type BankReconcileCandidateView,
} from "@/lib/amministrazione/bank-reconcile";
import {
  loadAllFicInvoicesForReconcile,
  loadReconcileInvoiceGroups,
  type BankReconcileInvoiceGroup,
} from "@/lib/amministrazione/bank-reconcile-load";
import { syncBankReportsFromFic } from "@/lib/amministrazione/bank-sync";
import { requireAreaAccess } from "@/lib/areas/guard";
import { createClient } from "@/lib/supabase/server";
import { z } from "zod";

export type BankPreviewMatchView = {
  invoiceId: string;
  ficId: number;
  matchScore: number;
  status: "auto_matched" | "manually_verified" | "discrepancy";
  invoiceNumber: string;
  invoiceType: string;
  /** Catalogo interno: emessa (+) / ricevuta (−) */
  invoiceKind?: "emessa" | "ricevuta";
  invoiceGross: number;
  invoiceEntityName: string;
  invoiceEntityVat: string;
  invoiceDate: string | null;
  invoiceStatus: string;
};

export type BankPreviewLineView = {
  rowIndex: number;
  transactionDate: string;
  valutaDate: string | null;
  amount: number;
  description: string;
  counterpartyName: string;
  dataRaw: string;
  valutaRaw: string;
  uscitaRaw: string;
  entrataRaw: string;
  causaleRaw: string;
  signNeedsReview: boolean;
  match: BankPreviewMatchView | null;
};

export type BankContextTxView = {
  id: string;
  transactionDate: string;
  valutaDate: string | null;
  amount: number;
  description: string;
  counterpartyName: string;
  accountName: string;
};

const rangeSchema = z.object({
  dateFrom: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  dateTo: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
});

export type BankTransactionView = {
  id: string;
  ficPaymentId: string;
  accountName: string;
  transactionDate: string;
  valutaDate: string | null;
  amount: number;
  description: string;
  counterpartyName: string;
  counterpartyVat: string;
  rawData: Record<string, unknown>;
  signNeedsReview: boolean;
  match: {
    id: string;
    invoiceId: string;
    ficId: number;
    matchScore: number;
    status: "auto_matched" | "manually_verified" | "discrepancy";
    invoiceNumber: string;
    invoiceType: string;
    invoiceKind?: "emessa" | "ricevuta";
    invoiceGross: number;
    invoiceEntityName: string;
    invoiceEntityVat: string;
    invoiceDate: string | null;
    invoiceStatus: string;
  } | null;
};

export type BankPeriodSummary = {
  entrateCount: number;
  entrateTotal: number;
  usciteCount: number;
  usciteTotal: number;
  dubbieCount: number;
  dubbieTotal: number;
  vociCount: number;
  dateFirst: string | null;
  dateLast: string | null;
};

function emptyBankPeriodSummary(): BankPeriodSummary {
  return {
    entrateCount: 0,
    entrateTotal: 0,
    usciteCount: 0,
    usciteTotal: 0,
    dubbieCount: 0,
    dubbieTotal: 0,
    vociCount: 0,
    dateFirst: null,
    dateLast: null,
  };
}

function buildBankPeriodSummary(
  rows: Array<{
    amount: number;
    signNeedsReview: boolean;
    transactionDate: string;
  }>
): BankPeriodSummary {
  const summary = emptyBankPeriodSummary();
  let minDate: string | null = null;
  let maxDate: string | null = null;
  for (const r of rows) {
    summary.vociCount += 1;
    const d = r.transactionDate;
    if (d) {
      if (!minDate || d < minDate) minDate = d;
      if (!maxDate || d > maxDate) maxDate = d;
    }
    const mag = Math.abs(r.amount) || 0;
    if (r.signNeedsReview) {
      summary.dubbieCount += 1;
      summary.dubbieTotal += mag;
      continue;
    }
    if (r.amount > 0) {
      summary.entrateCount += 1;
      summary.entrateTotal += r.amount;
    } else if (r.amount < 0) {
      summary.usciteCount += 1;
      summary.usciteTotal += mag;
    }
  }
  summary.entrateTotal = Math.round(summary.entrateTotal * 100) / 100;
  summary.usciteTotal = Math.round(summary.usciteTotal * 100) / 100;
  summary.dubbieTotal = Math.round(summary.dubbieTotal * 100) / 100;
  summary.dateFirst = minDate;
  summary.dateLast = maxDate;
  return summary;
}

export async function testOpenAiConnectionAction(): Promise<
  | {
      success: true;
      keyPresent: true;
      model: string;
      latencyMs: number;
      reply: string;
    }
  | {
      success: false;
      keyPresent: boolean;
      model: string | null;
      error: string;
    }
> {
  await requireAreaAccess("area-fiscale");
  const apiKey = process.env.OPENAI_API_KEY?.trim() ?? "";
  const model =
    process.env.BANK_OPENAI_MODEL?.trim() ||
    process.env.OPENAI_MODEL?.trim() ||
    "gpt-4o";

  if (!apiKey) {
    return {
      success: false,
      keyPresent: false,
      model: null,
      error:
        "OPENAI_API_KEY non è visibile a questo deployment. Controlla Vercel → Settings → Environment Variables (Production) e fai Redeploy.",
    };
  }

  const started = Date.now();
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
        max_tokens: 20,
        messages: [
          {
            role: "user",
            content: 'Rispondi solo con la parola OK.',
          },
        ],
      }),
    });
    const latencyMs = Date.now() - started;
    const bodyText = await res.text();
    if (!res.ok) {
      return {
        success: false,
        keyPresent: true,
        model,
        error: `OpenAI HTTP ${res.status}: ${bodyText.slice(0, 240)}`,
      };
    }
    let reply = "";
    try {
      const json = JSON.parse(bodyText) as {
        choices?: Array<{ message?: { content?: string } }>;
      };
      reply = String(json.choices?.[0]?.message?.content ?? "").trim();
    } catch {
      reply = bodyText.slice(0, 80);
    }
    return {
      success: true,
      keyPresent: true,
      model,
      latencyMs,
      reply: reply || "(vuoto)",
    };
  } catch (e) {
    return {
      success: false,
      keyPresent: true,
      model,
      error: e instanceof Error ? e.message : "Errore di rete verso OpenAI",
    };
  }
}

export async function purgeBankImportedDataAction(): Promise<
  { success: true; softDeletedTx: number } | { success: false; error: string }
> {
  const { auth } = await requireAreaAccess("area-fiscale");
  try {
    const supabase = await createClient();
    const now = new Date().toISOString();

    await supabase
      .from("bank_invoice_matches")
      .update({ deleted_at: now, updated_at: now })
      .is("deleted_at", null);

    const { data: txs } = await supabase
      .from("bank_transactions")
      .update({
        deleted_at: now,
        updated_at: now,
        deleted_by: auth.userId,
      })
      .is("deleted_at", null)
      .select("id");

    await supabase
      .from("bank_import_batches")
      .update({
        deleted_at: now,
        updated_at: now,
        documento_stato: "annullato",
        deleted_by: auth.userId,
      })
      .is("deleted_at", null);

    const softDeletedTx = txs?.length ?? 0;
    await writeAuditLog({
      entity_type: "bank_transactions",
      entity_id: "purge",
      action: "soft_delete",
      actor_id: auth.userId,
      summary: `Pulizia Rapporti Banca: soft-delete ${softDeletedTx} movimenti`,
      payload: { softDeletedTx },
    });

    return { success: true, softDeletedTx };
  } catch (e) {
    console.error("[bank purge]", e);
    return {
      success: false,
      error: e instanceof Error ? e.message : "Pulizia fallita",
    };
  }
}

function isCsvFile(file: File): boolean {
  const nameLower = file.name.toLowerCase();
  return (
    nameLower.endsWith(".csv") ||
    nameLower.endsWith(".cvs") ||
    file.type === "text/csv" ||
    file.type === "application/vnd.ms-excel" ||
    file.type === "text/plain"
  );
}

function isPdfFile(file: File): boolean {
  const nameLower = file.name.toLowerCase();
  return nameLower.endsWith(".pdf") || file.type === "application/pdf";
}

/** Anteprima CSV: nessun salvataggio DB. Include contesto “vetro” prima/dopo. */
export async function previewBankCsvAction(
  formData: FormData
): Promise<
  | {
      success: true;
      lines: BankPreviewLineView[];
      dateFrom: string | null;
      dateTo: string | null;
      notes: string;
      parserModel: string;
      contextBefore: BankContextTxView[];
      contextAfter: BankContextTxView[];
      contextAfterHasMore: boolean;
      totalsDetected: {
        countIncassi: number;
        countUscite: number;
        totaleIncassi: number;
        totaleUscite: number;
        totaleNetto: number;
      };
    }
  | { success: false; error: string }
> {
  await requireAreaAccess("area-fiscale");
  const file = formData.get("file");
  if (!(file instanceof File)) {
    return { success: false, error: "Seleziona un file CSV." };
  }
  if (!isCsvFile(file)) {
    return {
      success: false,
      error: "Estensione richiesta: .csv (accettato anche .cvs).",
    };
  }
  if (file.size > 15 * 1024 * 1024) {
    return { success: false, error: "CSV troppo grande (max 15 MB)." };
  }

  try {
    const buffer = Buffer.from(await file.arrayBuffer());
    const supabase = await createClient();
    const result = await previewBankStatementCsv({ supabase, buffer });
    if (result.lines.length === 0) {
      return {
        success: false,
        error:
          result.notes ||
          "Nessun movimento riconosciuto nel CSV. Attese 5 colonne fisse: Data;Data Valuta;Uscite;Entrate;Causale.",
      };
    }
    return {
      success: true,
      lines: result.lines.map((l) => ({
        rowIndex: l.csvRaw.rowIndex,
        transactionDate: l.transactionDate,
        valutaDate: l.valutaDate,
        amount: l.amount,
        description: l.description,
        counterpartyName: l.counterpartyName,
        dataRaw: l.csvRaw.dataRaw,
        valutaRaw: l.csvRaw.valutaRaw,
        uscitaRaw: l.csvRaw.uscitaRaw,
        entrataRaw: l.csvRaw.entrataRaw,
        causaleRaw: l.csvRaw.causaleRaw,
        signNeedsReview: false,
        match: null,
      })),
      dateFrom: result.dateFrom,
      dateTo: result.dateTo,
      notes: result.notes,
      parserModel: result.parserModel,
      contextBefore: result.contextBefore,
      contextAfter: result.contextAfter,
      contextAfterHasMore: result.contextAfterHasMore,
      totalsDetected: result.totalsDetected,
    };
  } catch (e) {
    console.error("[bank csv preview]", e);
    return {
      success: false,
      error: e instanceof Error ? e.message : "Anteprima CSV fallita.",
    };
  }
}

/**
 * Salva nel DB: CSV + PDF originale obbligatori, collegati allo stesso lotto.
 * keepRowIndices = JSON array degli indici riga da tenere (dopo eliminazioni in UI).
 * lineWorkJson = stato di lavoro (importo, segno, match) deciso in anteprima.
 */
export async function saveBankImportAction(
  formData: FormData
): Promise<
  | {
      success: true;
      batchId: string;
      rowsTotal: number;
      rowsImported: number;
      rowsSkipped: number;
      rowsMatched: number;
      rowsDoubtful: number;
      parserModel: string;
      notes: string;
      dateFrom: string | null;
      dateTo: string | null;
      pdfFileName: string;
      totalsImported: {
        countIncassi: number;
        countUscite: number;
        totaleIncassi: number;
        totaleUscite: number;
        totaleNetto: number;
      };
      totalsDetected: {
        countIncassi: number;
        countUscite: number;
        totaleIncassi: number;
        totaleUscite: number;
        totaleNetto: number;
      };
    }
  | { success: false; error: string }
> {
  const { auth } = await requireAreaAccess("area-fiscale");
  const csvFile = formData.get("csv");
  const pdfFile = formData.get("pdf");
  if (!(csvFile instanceof File)) {
    return { success: false, error: "Seleziona il file CSV." };
  }
  if (!(pdfFile instanceof File)) {
    return {
      success: false,
      error: "Allega il PDF originale della banca (obbligatorio).",
    };
  }
  if (!isCsvFile(csvFile)) {
    return { success: false, error: "Il file dati deve essere .csv / .cvs." };
  }
  if (!isPdfFile(pdfFile)) {
    return { success: false, error: "Il file originale deve essere .pdf." };
  }
  if (csvFile.size > 15 * 1024 * 1024) {
    return { success: false, error: "CSV troppo grande (max 15 MB)." };
  }
  if (pdfFile.size > 40 * 1024 * 1024) {
    return { success: false, error: "PDF troppo grande (max 40 MB)." };
  }

  let keepRowIndices: number[] | null = null;
  const keepRaw = formData.get("keepRowIndices");
  if (typeof keepRaw === "string" && keepRaw.trim()) {
    try {
      const parsed = JSON.parse(keepRaw) as unknown;
      if (!Array.isArray(parsed)) {
        return { success: false, error: "keepRowIndices non valido." };
      }
      keepRowIndices = parsed.map((n) => Number(n)).filter((n) => Number.isFinite(n));
    } catch {
      return { success: false, error: "keepRowIndices JSON non valido." };
    }
  }

  let lineWork: BankLineWorkStateMap | undefined;
  const workRaw = formData.get("lineWorkJson");
  if (typeof workRaw === "string" && workRaw.trim()) {
    try {
      lineWork = JSON.parse(workRaw) as BankLineWorkStateMap;
    } catch {
      return { success: false, error: "lineWorkJson non valido." };
    }
  }

  const accountName =
    String(formData.get("accountName") ?? "").trim() || "BCC Don Rizzo";

  try {
    const csvBuffer = Buffer.from(await csvFile.arrayBuffer());
    const pdfBuffer = Buffer.from(await pdfFile.arrayBuffer());
    const supabase = await createClient();
    const result = await saveBankStatementImport({
      supabase,
      userId: auth.userId,
      csvFileName: csvFile.name,
      csvBuffer,
      pdfFileName: pdfFile.name,
      pdfBuffer,
      accountName,
      keepRowIndices,
      lineWork,
    });

    await writeAuditLog({
      entity_type: "bank_import_batches",
      entity_id: result.batchId,
      action: "create",
      actor_id: auth.userId,
      summary: `Fine lavoro estratto CSV+PDF «${csvFile.name}» / «${pdfFile.name}»: ${result.rowsImported} movimenti, ${result.rowsMatched} conciliati`,
      payload: {
        ...result,
        csvName: csvFile.name,
        pdfName: pdfFile.name,
        keepCount: keepRowIndices?.length ?? null,
      },
    });

    return {
      success: true,
      batchId: result.batchId,
      rowsTotal: result.rowsTotal,
      rowsImported: result.rowsImported,
      rowsSkipped: result.rowsSkipped,
      rowsMatched: result.rowsMatched,
      rowsDoubtful: result.rowsDoubtful,
      parserModel: result.parserModel,
      notes: result.notes,
      dateFrom: result.dateFrom,
      dateTo: result.dateTo,
      pdfFileName: result.pdfFileName,
      totalsImported: result.totalsImported,
      totalsDetected: result.totalsDetected,
    };
  } catch (e) {
    console.error("[bank save import]", e);
    return {
      success: false,
      error: e instanceof Error ? e.message : "Salvataggio fallito.",
    };
  }
}

/**
 * Conciliazione in sessione di lavoro (anteprima): non scrive sul DB.
 * scope=all | selected (rowIndices) | one (rowIndices con 1 elemento).
 */
export async function reconcilePreviewLinesAction(input: {
  lines: Array<{
    rowIndex: number;
    amount: number;
    description: string;
    counterpartyName: string;
    transactionDate: string;
    matchInvoiceId?: string | null;
  }>;
  scope: "all" | "selected" | "one";
  rowIndices?: number[];
}): Promise<
  | {
      success: true;
      matched: number;
      skipped: number;
      attempted: number;
      updates: Array<{ rowIndex: number; match: BankPreviewMatchView | null }>;
    }
  | { success: false; error: string }
> {
  await requireAreaAccess("area-fiscale");
  const lines = Array.isArray(input.lines) ? input.lines : [];
  if (lines.length === 0) {
    return { success: false, error: "Nessuna riga da conciliare." };
  }

  const targetSet =
    input.scope === "all"
      ? null
      : new Set((input.rowIndices ?? []).map((n) => Number(n)));
  if (targetSet && targetSet.size === 0) {
    return {
      success: false,
      error:
        input.scope === "one"
          ? "Riga non valida."
          : "Seleziona almeno una riga da conciliare.",
    };
  }

  const supabase = await createClient();
  const invoices = await loadInvoiceCandidates(supabase);
  const used = await loadUsedPayments(supabase);
  // Fatture già assegnate in anteprima su altre righe (match totale)
  for (const l of lines) {
    if (l.matchInvoiceId) used.fullInvoiceIds.add(String(l.matchInvoiceId));
  }

  let attempted = 0;
  let matched = 0;
  let skipped = 0;
  const updates: Array<{ rowIndex: number; match: BankPreviewMatchView | null }> =
    [];

  for (const line of lines) {
    const ri = Number(line.rowIndex);
    if (targetSet && !targetSet.has(ri)) continue;
    if (line.matchInvoiceId) {
      skipped += 1;
      continue;
    }
    if (isBankCommissionFee(line.amount, line.description)) {
      skipped += 1;
      continue;
    }
    attempted += 1;
    const best = await bestInvoiceForTx(
      {
        amount: line.amount,
        description: line.description,
        counterparty_name: line.counterpartyName,
        transaction_date: line.transactionDate,
      },
      invoices,
      used
    );
    if (!best) {
      skipped += 1;
      updates.push({ rowIndex: ri, match: null });
      continue;
    }
    if (best.inv.dilazioneId) used.dilazioneIds.add(best.inv.dilazioneId);
    else used.fullInvoiceIds.add(String(best.inv.id));
    matched += 1;
    updates.push({
      rowIndex: ri,
      match: {
        invoiceId: String(best.inv.id),
        ficId: Number(best.inv.fic_id) || 0,
        matchScore: best.score,
        status: "manually_verified",
        invoiceNumber: String(best.inv.number ?? ""),
        invoiceType: String(best.inv.type ?? ""),
        invoiceKind: best.inv.kind,
        invoiceGross: Number(best.inv.amount_gross) || 0,
        invoiceEntityName: String(best.inv.entity_name ?? ""),
        invoiceEntityVat: "",
        invoiceDate: best.inv.date,
        invoiceStatus: String(best.inv.status ?? ""),
      },
    });
  }

  return { success: true, matched, skipped, attempted, updates };
}

/** Compat: vecchio nome azione → ora richiede flusso anteprima + save. */
export async function importBankStatementPdfAction(
  formData: FormData
): Promise<{ success: false; error: string }> {
  await requireAreaAccess("area-fiscale");
  void formData;
  return {
    success: false,
    error:
      "Usa «Carica anteprima» poi «Salva nel DB» con CSV e PDF originale collegati.",
  };
}

/**
 * PDF estratto conto → parser Python deterministico → CSV 5 col → DB.
 * Il PDF originale viene salvato come fonte collegata al lotto.
 * (Flusso legacy / lab — in Production preferire CSV + PDF da UI.)
 */
export async function importBankStatementFromDeterministicPdfAction(
  formData: FormData
): Promise<
  | {
      success: true;
      batchId: string;
      rowsTotal: number;
      rowsImported: number;
      rowsSkipped: number;
      rowsMatched: number;
      rowsDoubtful: number;
      parserModel: string;
      notes: string;
      dateFrom: string | null;
      dateTo: string | null;
      totalsImported: {
        countIncassi: number;
        countUscite: number;
        totaleIncassi: number;
        totaleUscite: number;
        totaleNetto: number;
      };
      totalsDetected: {
        countIncassi: number;
        countUscite: number;
        totaleIncassi: number;
        totaleUscite: number;
        totaleNetto: number;
      };
    }
  | { success: false; error: string }
> {
  const { auth } = await requireAreaAccess("area-fiscale");
  const file = formData.get("file");
  if (!(file instanceof File)) {
    return { success: false, error: "Seleziona un file PDF." };
  }
  if (!isPdfFile(file)) {
    return { success: false, error: "Estensione richiesta: .pdf" };
  }
  if (file.size > 20 * 1024 * 1024) {
    return { success: false, error: "PDF troppo grande (max 20 MB)." };
  }

  const accountName =
    String(formData.get("accountName") ?? "").trim() || "BCC Don Rizzo";

  try {
    const pdfBuffer = Buffer.from(await file.arrayBuffer());
    const { result } = await parseBankPdfDeterministic(pdfBuffer, {
      excel: true,
      jsonFile: true,
    });
    if (!result.rows.length) {
      return {
        success: false,
        error:
          "Nessun movimento estratto dal PDF (parser deterministico). Verifica che il PDF abbia tabelle leggibili.",
      };
    }

    const csv = bankPdfRowsToCsv(result.rows);
    const csvBuffer = Buffer.from(csv, "utf8");
    const supabase = await createClient();
    const imported = await saveBankStatementImport({
      supabase,
      userId: auth.userId,
      csvFileName: file.name.replace(/\.pdf$/i, ".csv"),
      csvBuffer,
      pdfFileName: file.name,
      pdfBuffer,
      accountName,
    });

    await writeAuditLog({
      entity_type: "bank_import_batches",
      entity_id: imported.batchId,
      action: "create",
      actor_id: auth.userId,
      summary: `Import PDF→CSV deterministico «${file.name}»: ${imported.rowsImported} nuovi / ${imported.rowsTotal} rilevati`,
      payload: {
        ...imported,
        pdfParser: result.parser,
        pdfCount: result.count,
      },
    });

    return {
      success: true,
      ...imported,
      parserModel: `${result.parser}+csv-import`,
      notes: `${result.parser}: ${result.count} voci dal PDF. ${imported.notes}`,
    };
  } catch (e) {
    console.error("[bank pdf deterministic import]", e);
    return {
      success: false,
      error: e instanceof Error ? e.message : "Import PDF fallito.",
    };
  }
}

export async function syncBankReportsAction(raw: unknown): Promise<
  | {
      success: true;
      fetched: number;
      upserted: number;
      matched: number;
      invoicesMarkedPaid: number;
      accountName: string;
      fromCashbook: number;
      fromDocumentPayments: number;
      skippedNoDate: number;
    }
  | { success: false; error: string }
> {
  const { auth } = await requireAreaAccess("area-fiscale");
  const parsed = rangeSchema.safeParse(raw);
  if (!parsed.success) {
    return { success: false, error: "Intervallo date non valido." };
  }
  try {
    const supabase = await createClient();
    const result = await syncBankReportsFromFic({
      supabase,
      userId: auth.userId,
      dateFrom: parsed.data.dateFrom,
      dateTo: parsed.data.dateTo,
    });
    await writeAuditLog({
      entity_type: "bank_transactions",
      entity_id: `${parsed.data.dateFrom}_${parsed.data.dateTo}`,
      action: "sync",
      actor_id: auth.userId,
      summary: `Sync Rapporti Banca FiC: ${result.fetched} movimenti, ${result.matched} match`,
      payload: result,
    });
    return { success: true, ...result };
  } catch (e) {
    console.error("[bank sync]", e);
    return {
      success: false,
      error: e instanceof Error ? e.message : "Sync fallita.",
    };
  }
}

export async function listBankTransactionsAction(input: {
  dateFrom: string;
  dateTo: string;
  tipo?: "tutti" | "entrate" | "uscite" | "non_riconciliati" | "da_confermare";
}): Promise<
  | {
      success: true;
      items: BankTransactionView[];
      pendingSignCount: number;
      summary: BankPeriodSummary;
    }
  | { success: false; error: string }
> {
  await requireAreaAccess("area-fiscale");
  const parsed = rangeSchema.safeParse({
    dateFrom: input.dateFrom,
    dateTo: input.dateTo,
  });
  if (!parsed.success) {
    return { success: false, error: "Intervallo date non valido." };
  }
  const supabase = await createClient();

  // Riepilogo sempre su tutto il periodo (Data esecuzione, non Valuta)
  const { data: periodRows, error: periodErr } = await supabase
    .from("bank_transactions")
    .select("amount, sign_needs_review, transaction_date")
    .is("deleted_at", null)
    .gte("transaction_date", parsed.data.dateFrom)
    .lte("transaction_date", parsed.data.dateTo);
  if (periodErr) return { success: false, error: periodErr.message };
  const summary = buildBankPeriodSummary(
    (periodRows ?? []).map((r) => ({
      amount: Number(r.amount) || 0,
      signNeedsReview: Boolean(r.sign_needs_review),
      transactionDate: String(r.transaction_date ?? ""),
    }))
  );

  // Ordinamento per Data esecuzione (prima colonna), non Valuta
  let q = supabase
    .from("bank_transactions")
    .select("*")
    .is("deleted_at", null)
    .gte("transaction_date", parsed.data.dateFrom)
    .lte("transaction_date", parsed.data.dateTo)
    .order("transaction_date", { ascending: true })
    .order("id", { ascending: true });

  if (input.tipo === "da_confermare") {
    q = q.eq("sign_needs_review", true);
  }
  // Entrate/uscite: non nascondere le voci in attesa di segno
  if (input.tipo === "entrate") {
    q = q.or("amount.gt.0,sign_needs_review.eq.true");
  }
  if (input.tipo === "uscite") {
    q = q.or("amount.lt.0,sign_needs_review.eq.true");
  }

  const { data, error } = await q;
  if (error) return { success: false, error: error.message };

  const txIds = (data ?? []).map((r) => String(r.id));
  const matchByTx = new Map<
    string,
    {
      id: string;
      invoice_id: string;
      invoice_kind: "emessa" | "ricevuta" | null;
      match_score: number;
      status: string;
    }
  >();

  if (txIds.length > 0) {
    const { data: matches } = await supabase
      .from("bank_invoice_matches")
      .select("id, transaction_id, invoice_id, invoice_kind, match_score, status")
      .in("transaction_id", txIds)
      .is("deleted_at", null);
    for (const m of matches ?? []) {
      const tid = String(m.transaction_id);
      const prev = matchByTx.get(tid);
      if (!prev || Number(m.match_score) > prev.match_score) {
        const kindRaw = String(m.invoice_kind ?? "");
        matchByTx.set(tid, {
          id: String(m.id),
          invoice_id: String(m.invoice_id),
          invoice_kind:
            kindRaw === "emessa" || kindRaw === "ricevuta" ? kindRaw : null,
          match_score: Number(m.match_score) || 0,
          status: String(m.status),
        });
      }
    }
  }

  const invoiceById = new Map<
    string,
    {
      fic_id: number;
      number: string;
      type: string;
      kind: "emessa" | "ricevuta";
      amount_gross: number;
      entity_name: string;
      entity_vat: string;
      date: string | null;
      status: string;
    }
  >();

  const emessaIds = [...matchByTx.values()]
    .filter((m) => m.invoice_kind === "emessa" || m.invoice_kind == null)
    .map((m) => m.invoice_id);
  const ricevutaIds = [...matchByTx.values()]
    .filter((m) => m.invoice_kind === "ricevuta" || m.invoice_kind == null)
    .map((m) => m.invoice_id);

  if (emessaIds.length > 0) {
    const { data: invs } = await supabase
      .from("fatture_emesse")
      .select(
        "id, fic_id, numero_interno, numero_fattura, cliente_ragione_sociale, totale, data_emissione, stato_pagamento"
      )
      .in("id", [...new Set(emessaIds)])
      .is("deleted_at", null);
    for (const i of invs ?? []) {
      invoiceById.set(String(i.id), {
        fic_id: Number(i.fic_id) || 0,
        number:
          String(i.numero_fattura ?? "").trim() ||
          String(i.numero_interno ?? "").trim(),
        type: "issued",
        kind: "emessa",
        amount_gross: Math.abs(Number(i.totale) || 0),
        entity_name: String(i.cliente_ragione_sociale ?? ""),
        entity_vat: "",
        date: (i.data_emissione as string | null) ?? null,
        status: String(i.stato_pagamento ?? ""),
      });
    }
  }
  if (ricevutaIds.length > 0) {
    const { data: invs } = await supabase
      .from("fatture_ricevute")
      .select(
        "id, fic_id, numero_interno, numero_documento_esterno, fornitore_ragione_sociale, totale, data_emissione, stato_pagamento"
      )
      .in("id", [...new Set(ricevutaIds)])
      .is("deleted_at", null);
    for (const i of invs ?? []) {
      if (invoiceById.has(String(i.id))) continue;
      invoiceById.set(String(i.id), {
        fic_id: Number(i.fic_id) || 0,
        number:
          String(i.numero_documento_esterno ?? "").trim() ||
          String(i.numero_interno ?? "").trim(),
        type: "received",
        kind: "ricevuta",
        amount_gross: Math.abs(Number(i.totale) || 0),
        entity_name: String(i.fornitore_ragione_sociale ?? ""),
        entity_vat: "",
        date: (i.data_emissione as string | null) ?? null,
        status: String(i.stato_pagamento ?? ""),
      });
    }
  }

  let items: BankTransactionView[] = (data ?? []).map((r) => {
    const m = matchByTx.get(String(r.id));
    const inv = m ? invoiceById.get(m.invoice_id) : null;
    return {
      id: String(r.id),
      ficPaymentId: String(r.fic_payment_id),
      accountName: String(r.account_name ?? "BCC Don Rizzo"),
      transactionDate: String(r.transaction_date),
      valutaDate: (r.valuta_date as string | null) ?? null,
      amount: Number(r.amount) || 0,
      description: String(r.description ?? ""),
      counterpartyName: String(r.counterparty_name ?? ""),
      counterpartyVat: String(r.counterparty_vat ?? ""),
      rawData: (r.raw_data as Record<string, unknown>) ?? {},
      signNeedsReview: Boolean(r.sign_needs_review),
      match:
        m && inv
          ? {
              id: m.id,
              invoiceId: m.invoice_id,
              ficId: inv.fic_id,
              matchScore: m.match_score,
              status: m.status as NonNullable<
                BankTransactionView["match"]
              >["status"],
              invoiceNumber: inv.number,
              invoiceType: inv.type,
              invoiceKind: inv.kind,
              invoiceGross: inv.amount_gross,
              invoiceEntityName: inv.entity_name,
              invoiceEntityVat: inv.entity_vat,
              invoiceDate: inv.date,
              invoiceStatus: inv.status,
            }
          : null,
    };
  });

  if (input.tipo === "non_riconciliati") {
    items = items.filter(
      (i) =>
        (!i.match || i.match.status === "discrepancy") &&
        !isBankCommissionFee(i.amount, i.description)
    );
  }

  return {
    success: true,
    items,
    pendingSignCount: summary.dubbieCount,
    summary,
  };
}

export async function verifyBankMatchAction(input: {
  matchId: string;
  status: "manually_verified" | "discrepancy";
}): Promise<{ success: true } | { success: false; error: string }> {
  const { auth } = await requireAreaAccess("area-fiscale");
  const supabase = await createClient();
  const now = new Date().toISOString();
  const { data, error } = await supabase
    .from("bank_invoice_matches")
    .update({
      status: input.status,
      verified_at: now,
      created_by: auth.userId,
    })
    .eq("id", input.matchId)
    .is("deleted_at", null)
    .select("id, transaction_id, invoice_id")
    .maybeSingle();
  if (error) return { success: false, error: error.message };
  if (!data) return { success: false, error: "Match non trovato." };

  await writeAuditLog({
    entity_type: "bank_invoice_matches",
    entity_id: String(data.id),
    action: "verify",
    actor_id: auth.userId,
    summary: `Riconciliazione bancaria ${input.status}`,
    payload: {
      transaction_id: data.transaction_id,
      invoice_id: data.invoice_id,
      status: input.status,
      verified_at: now,
    },
  });
  return { success: true };
}

type InvCandidate = Awaited<
  ReturnType<typeof loadAllFicInvoicesForReconcile>
>[number];

type UsedPayments = {
  /** Fatture già matchate sul totale (senza dilazione). */
  fullInvoiceIds: Set<string>;
  /** Rate già matchate. */
  dilazioneIds: Set<string>;
};

async function loadUsedPayments(
  supabase: Awaited<ReturnType<typeof createClient>>
): Promise<UsedPayments> {
  const { data } = await supabase
    .from("bank_invoice_matches")
    .select("invoice_id, dilazione_id")
    .is("deleted_at", null);
  const fullInvoiceIds = new Set<string>();
  const dilazioneIds = new Set<string>();
  for (const u of data ?? []) {
    const dil = u.dilazione_id ? String(u.dilazione_id) : "";
    if (dil) dilazioneIds.add(dil);
    else if (u.invoice_id) fullInvoiceIds.add(String(u.invoice_id));
  }
  return { fullInvoiceIds, dilazioneIds };
}

function isCandidateAvailable(
  inv: InvCandidate,
  used: UsedPayments
): boolean {
  if (inv.dilazioneId) {
    return !used.dilazioneIds.has(inv.dilazioneId);
  }
  return !used.fullInvoiceIds.has(String(inv.id));
}

async function loadInvoiceCandidates(
  supabase: Awaited<ReturnType<typeof createClient>>
): Promise<InvCandidate[]> {
  return loadAllFicInvoicesForReconcile(supabase);
}

async function bestInvoiceForTx(
  tx: {
    amount: number;
    description: string;
    counterparty_name: string;
    transaction_date: string;
  },
  invoices: InvCandidate[],
  used: UsedPayments
): Promise<{ inv: InvCandidate; score: number } | null> {
  const amount = Number(tx.amount) || 0;
  const kind = invoiceKindFromBankAmount(amount);
  if (!kind) return null;
  const cents = moneyCents(Math.abs(amount));
  const txDate = String(tx.transaction_date);

  const hits: Array<{ inv: InvCandidate; days: number }> = [];
  for (const inv of invoices) {
    if (inv.kind !== kind) continue;
    if (!isCandidateAvailable(inv, used)) continue;
    if (moneyCents(inv.amount_gross) !== cents) continue;
    const days = daysAbs(txDate, inv.date);
    if (days == null || days > BANK_RECONCILE_NEAR_DAYS) continue;
    hits.push({ inv, days });
  }
  if (hits.length !== 1) return null;
  const only = hits[0]!;
  return { inv: only.inv, score: 85 };
}

/** Concilia un singolo movimento con la fattura migliore (salvato in DB). */
export async function reconcileBankTransactionAction(input: {
  transactionId: string;
}): Promise<
  | {
      success: true;
      matched: true;
      matchId: string;
      invoiceId: string;
      invoiceNumber: string;
      score: number;
    }
  | { success: true; matched: false; reason: string }
  | { success: false; error: string }
> {
  const { auth } = await requireAreaAccess("area-fiscale");
  const id = String(input.transactionId ?? "").trim();
  if (!id) return { success: false, error: "Movimento non valido." };

  const supabase = await createClient();
  const { data: tx, error: txErr } = await supabase
    .from("bank_transactions")
    .select(
      "id, amount, description, counterparty_name, transaction_date, deleted_at"
    )
    .eq("id", id)
    .is("deleted_at", null)
    .maybeSingle();
  if (txErr) return { success: false, error: txErr.message };
  if (!tx) return { success: false, error: "Movimento non trovato." };

  const { data: existing } = await supabase
    .from("bank_invoice_matches")
    .select("id, invoice_id, status")
    .eq("transaction_id", id)
    .is("deleted_at", null)
    .maybeSingle();
  if (existing?.id) {
    return {
      success: true,
      matched: false,
      reason: "Movimento già collegato a una fattura.",
    };
  }

  const invoices = await loadInvoiceCandidates(supabase);
  const used = await loadUsedPayments(supabase);

  const best = await bestInvoiceForTx(tx, invoices, used);
  if (!best) {
    return {
      success: true,
      matched: false,
      reason:
        "Nessuna fattura/rata con importo uguale entro ±15 giorni (concilia automatica massiva non collega oltre).",
    };
  }

  const now = new Date().toISOString();
  const { data: match, error: matchErr } = await supabase
    .from("bank_invoice_matches")
    .insert({
      transaction_id: id,
      invoice_id: best.inv.id,
      invoice_kind: best.inv.kind,
      dilazione_id: best.inv.dilazioneId,
      match_score: best.score,
      status: "manually_verified",
      verified_at: now,
      created_by: auth.userId,
      updated_by: auth.userId,
    })
    .select("id")
    .single();
  if (matchErr || !match) {
    return { success: false, error: matchErr?.message ?? "Match non creato." };
  }

  if (best.inv.dilazioneId) {
    await markDilazionePagata(
      supabase,
      best.inv.kind,
      best.inv.dilazioneId,
      auth.userId
    );
  }

  await writeAuditLog({
    entity_type: "bank_invoice_matches",
    entity_id: String(match.id),
    action: "create",
    actor_id: auth.userId,
    summary: `Concilia questo: mov. banca ↔ fatt. ${best.inv.number} (${best.score}%)`,
    payload: {
      transaction_id: id,
      invoice_id: best.inv.id,
      invoice_kind: best.inv.kind,
      dilazione_id: best.inv.dilazioneId,
      score: best.score,
    },
  });

  return {
    success: true,
    matched: true,
    matchId: String(match.id),
    invoiceId: String(best.inv.id),
    invoiceNumber: String(best.inv.number ?? ""),
    score: best.score,
  };
}

/** Concilia tutti i movimenti del periodo ancora senza fattura. */
export async function reconcileAllBankTransactionsAction(input: {
  dateFrom: string;
  dateTo: string;
}): Promise<
  | {
      success: true;
      attempted: number;
      matched: number;
      skipped: number;
    }
  | { success: false; error: string }
> {
  const { auth } = await requireAreaAccess("area-fiscale");
  const parsed = rangeSchema.safeParse(input);
  if (!parsed.success) {
    return { success: false, error: "Intervallo date non valido." };
  }

  const supabase = await createClient();
  const { data: txs, error: txErr } = await supabase
    .from("bank_transactions")
    .select(
      "id, amount, description, counterparty_name, transaction_date"
    )
    .is("deleted_at", null)
    .gte("transaction_date", parsed.data.dateFrom)
    .lte("transaction_date", parsed.data.dateTo)
    .order("transaction_date", { ascending: true });
  if (txErr) return { success: false, error: txErr.message };

  const txIds = (txs ?? []).map((t) => String(t.id));
  const already = new Set<string>();
  if (txIds.length > 0) {
    const { data: matches } = await supabase
      .from("bank_invoice_matches")
      .select("transaction_id, invoice_id")
      .in("transaction_id", txIds)
      .is("deleted_at", null);
    for (const m of matches ?? []) {
      already.add(String(m.transaction_id));
    }
  }

  const invoices = await loadInvoiceCandidates(supabase);
  const used = await loadUsedPayments(supabase);

  let attempted = 0;
  let matched = 0;
  let skipped = 0;
  let firstInsertError: string | null = null;
  const now = new Date().toISOString();

  for (const tx of txs ?? []) {
    const tid = String(tx.id);
    if (already.has(tid)) {
      skipped += 1;
      continue;
    }
    if (
      isBankCommissionFee(
        Number(tx.amount) || 0,
        String(tx.description ?? "")
      )
    ) {
      skipped += 1;
      continue;
    }
    attempted += 1;
    const best = await bestInvoiceForTx(tx, invoices, used);
    if (!best) {
      skipped += 1;
      continue;
    }

    const { data: match, error: matchErr } = await supabase
      .from("bank_invoice_matches")
      .insert({
        transaction_id: tid,
        invoice_id: best.inv.id,
        invoice_kind: best.inv.kind,
        dilazione_id: best.inv.dilazioneId,
        match_score: best.score,
        status: "auto_matched",
        verified_at: now,
        created_by: auth.userId,
        updated_by: auth.userId,
      })
      .select("id")
      .single();
    if (matchErr || !match) {
      skipped += 1;
      if (!firstInsertError) {
        firstInsertError = matchErr?.message ?? "Insert match fallito.";
      }
      continue;
    }
    if (best.inv.dilazioneId) {
      used.dilazioneIds.add(best.inv.dilazioneId);
      await markDilazionePagata(
        supabase,
        best.inv.kind,
        best.inv.dilazioneId,
        auth.userId
      );
    } else {
      used.fullInvoiceIds.add(String(best.inv.id));
    }
    matched += 1;
  }

  if (matched === 0 && firstInsertError && attempted > 0) {
    return {
      success: false,
      error: `Match trovato ma salvataggio fallito: ${firstInsertError}`,
    };
  }

  await writeAuditLog({
    entity_type: "bank_transactions",
    entity_id: "bulk-reconcile",
    action: "reconcile_all",
    actor_id: auth.userId,
    summary: `Concilia tutto ${parsed.data.dateFrom}–${parsed.data.dateTo}: ${matched} collegati / ${attempted} tentati`,
    payload: {
      dateFrom: parsed.data.dateFrom,
      dateTo: parsed.data.dateTo,
      attempted,
      matched,
      skipped,
    },
  });

  return { success: true, attempted, matched, skipped };
}

export async function setBankTransactionSignAction(input: {
  transactionId: string;
  sign: "+" | "-";
}): Promise<
  | { success: true; amount: number }
  | { success: false; error: string }
> {
  const { auth } = await requireAreaAccess("area-fiscale");
  const id = String(input.transactionId ?? "").trim();
  if (!id) return { success: false, error: "Movimento non valido." };
  if (input.sign !== "+" && input.sign !== "-") {
    return { success: false, error: "Segno non valido." };
  }

  const supabase = await createClient();
  const { data: row, error: readErr } = await supabase
    .from("bank_transactions")
    .select("id, amount, description, raw_data, sign_needs_review")
    .eq("id", id)
    .is("deleted_at", null)
    .maybeSingle();
  if (readErr) return { success: false, error: readErr.message };
  if (!row) return { success: false, error: "Movimento non trovato." };

  const mag = Math.abs(Number(row.amount) || 0);
  if (mag === 0) return { success: false, error: "Importo zero." };
  const amount = input.sign === "+" ? mag : -mag;
  const prevRaw =
    row.raw_data && typeof row.raw_data === "object"
      ? (row.raw_data as Record<string, unknown>)
      : {};

  const { error: updErr } = await supabase
    .from("bank_transactions")
    .update({
      amount,
      sign_needs_review: false,
      updated_by: auth.userId,
      raw_data: {
        ...prevRaw,
        sign_source: "operator-choice",
        sign_chosen: input.sign,
        sign_chosen_at: new Date().toISOString(),
      },
    })
    .eq("id", id)
    .is("deleted_at", null);
  if (updErr) return { success: false, error: updErr.message };

  await writeAuditLog({
    entity_type: "bank_transactions",
    entity_id: id,
    action: "update",
    actor_id: auth.userId,
    summary: `Segno movimento impostato a ${input.sign} (${amount.toFixed(2)} €)`,
    payload: {
      previous_amount: row.amount,
      amount,
      sign: input.sign,
      description: row.description,
    },
  });

  return { success: true, amount };
}

/** Ribalta segno + ↔ − (scelta operatore, audit ISO). */
export async function flipBankTransactionSignAction(input: {
  transactionId: string;
}): Promise<
  | { success: true; amount: number }
  | { success: false; error: string }
> {
  const { auth } = await requireAreaAccess("area-fiscale");
  const id = String(input.transactionId ?? "").trim();
  if (!id) return { success: false, error: "Movimento non valido." };

  const supabase = await createClient();
  const { data: row, error: readErr } = await supabase
    .from("bank_transactions")
    .select("id, amount, description, raw_data, sign_needs_review")
    .eq("id", id)
    .is("deleted_at", null)
    .maybeSingle();
  if (readErr) return { success: false, error: readErr.message };
  if (!row) return { success: false, error: "Movimento non trovato." };

  const { data: existingMatch } = await supabase
    .from("bank_invoice_matches")
    .select("id")
    .eq("transaction_id", id)
    .is("deleted_at", null)
    .maybeSingle();
  if (existingMatch?.id) {
    return {
      success: false,
      error:
        "Movimento già conciliato: scollega la fattura prima di ribaltare il segno.",
    };
  }

  const prev = Number(row.amount) || 0;
  if (prev === 0) return { success: false, error: "Importo zero." };
  const amount = -prev;
  const sign: "+" | "-" = amount > 0 ? "+" : "-";
  const prevRaw =
    row.raw_data && typeof row.raw_data === "object"
      ? (row.raw_data as Record<string, unknown>)
      : {};

  const { error: updErr } = await supabase
    .from("bank_transactions")
    .update({
      amount,
      sign_needs_review: false,
      updated_by: auth.userId,
      raw_data: {
        ...prevRaw,
        sign_source: "operator-flip",
        sign_chosen: sign,
        sign_chosen_at: new Date().toISOString(),
        previous_amount: prev,
      },
    })
    .eq("id", id)
    .is("deleted_at", null);
  if (updErr) return { success: false, error: updErr.message };

  await writeAuditLog({
    entity_type: "bank_transactions",
    entity_id: id,
    action: "update",
    actor_id: auth.userId,
    summary: `Segno ribaltato ${prev > 0 ? "+" : "−"} → ${sign} (${amount.toFixed(2)} €)`,
    payload: {
      previous_amount: prev,
      amount,
      sign,
      description: row.description,
    },
  });

  return { success: true, amount };
}

// ---------------------------------------------------------------------------
// Concilia questo: auto (importo master) / manuale / browse ±15 espandibile
// ---------------------------------------------------------------------------

function moneyCents(n: number): number {
  return Math.round(Math.abs(Number(n) || 0) * 100);
}

function daysAbs(a: string | null, b: string | null): number | null {
  if (!a || !b) return null;
  const d1 = Date.parse(a.slice(0, 10));
  const d2 = Date.parse(b.slice(0, 10));
  if (!Number.isFinite(d1) || !Number.isFinite(d2)) return null;
  return Math.abs(d1 - d2) / 86_400_000;
}

function addDaysIso(isoDate: string, days: number): string {
  const t = Date.parse(isoDate.slice(0, 10));
  const d = new Date(t + days * 86_400_000);
  const y = d.getUTCFullYear();
  const m = String(d.getUTCMonth() + 1).padStart(2, "0");
  const day = String(d.getUTCDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

async function markDilazionePagata(
  supabase: Awaited<ReturnType<typeof createClient>>,
  kind: "emessa" | "ricevuta",
  dilazioneId: string,
  userId: string
): Promise<void> {
  const table =
    kind === "emessa"
      ? "fatture_emesse_dilazioni"
      : "fatture_ricevute_dilazioni";
  await supabase
    .from(table)
    .update({
      stato_pagamento: "pagato",
      updated_by: userId,
    })
    .eq("id", dilazioneId)
    .is("deleted_at", null);
}

async function insertBankMatch(input: {
  supabase: Awaited<ReturnType<typeof createClient>>;
  userId: string;
  transactionId: string;
  invoiceId: string;
  invoiceKind: "emessa" | "ricevuta";
  dilazioneId: string | null;
  score: number;
  mode: "auto" | "manual" | "choice";
  invoiceNumber: string;
}): Promise<
  { success: true; matchId: string } | { success: false; error: string }
> {
  const now = new Date().toISOString();
  const { data: match, error: matchErr } = await input.supabase
    .from("bank_invoice_matches")
    .insert({
      transaction_id: input.transactionId,
      invoice_id: input.invoiceId,
      invoice_kind: input.invoiceKind,
      dilazione_id: input.dilazioneId,
      match_score: input.score,
      status: "manually_verified",
      verified_at: now,
      created_by: input.userId,
      updated_by: input.userId,
    })
    .select("id")
    .single();
  if (matchErr || !match) {
    return { success: false, error: matchErr?.message ?? "Match non creato." };
  }
  if (input.dilazioneId) {
    await markDilazionePagata(
      input.supabase,
      input.invoiceKind,
      input.dilazioneId,
      input.userId
    );
  }
  void writeAuditLog({
    entity_type: "bank_invoice_matches",
    entity_id: String(match.id),
    action: "create",
    actor_id: input.userId,
    summary: `Conciliazione ${input.mode}: mov. ↔ ${input.invoiceNumber}`,
    payload: {
      transaction_id: input.transactionId,
      invoice_id: input.invoiceId,
      invoice_kind: input.invoiceKind,
      dilazione_id: input.dilazioneId,
      mode: input.mode,
      score: input.score,
    },
  });
  return { success: true, matchId: String(match.id) };
}

function candidateToView(
  inv: InvCandidate,
  txDate: string,
  amountAbs: number,
  description: string,
  counterparty: string
): BankReconcileCandidateView {
  const daysFromTx = daysAbs(txDate, inv.date);
  const entityScore = scoreEntityInCausale(
    inv.entity_name,
    description,
    counterparty
  );
  return {
    id: inv.id,
    candidateKey: inv.candidateKey,
    dilazioneId: inv.dilazioneId,
    isDilazione: inv.isDilazione,
    kind: inv.kind,
    type: inv.type,
    ficId: Number(inv.fic_id) || 0,
    number: inv.number,
    entityName: inv.entity_name,
    amountGross: inv.amount_gross,
    date: inv.date,
    status: inv.status,
    daysFromTx,
    amountMatch: moneyCents(inv.amount_gross) === moneyCents(amountAbs),
    entityScore,
  };
}

/**
 * Tentativo automatico: solo importo (±1¢) entro ±60 gg.
 * ≤15 gg: 1 → auto / più → scelta; 16–60 gg → conferma operatore.
 */
export async function attemptAutoReconcileBankTxAction(input: {
  transactionId: string;
}): Promise<
  | {
      success: true;
      outcome: "matched";
      matchId: string;
      invoiceId: string;
      invoiceNumber: string;
      score: number;
    }
  | {
      success: true;
      outcome: "needs_choice";
      candidates: BankReconcileCandidateView[];
      kind: "emessa" | "ricevuta";
      amountAbs: number;
      txDate: string;
      description: string;
    }
  | {
      success: true;
      outcome: "needs_far_confirm";
      candidates: BankReconcileCandidateView[];
      kind: "emessa" | "ricevuta";
      amountAbs: number;
      txDate: string;
      description: string;
      counterparty: string;
    }
  | {
      success: true;
      outcome: "needs_browse";
      kind: "emessa" | "ricevuta";
      amountAbs: number;
      txDate: string;
      description: string;
      reason: string;
    }
  | { success: true; outcome: "already_linked"; reason: string }
  | { success: false; error: string }
> {
  const { auth } = await requireAreaAccess("area-fiscale");
  const id = String(input.transactionId ?? "").trim();
  if (!id) return { success: false, error: "Movimento non valido." };

  const supabase = await createClient();
  const { data: tx, error: txErr } = await supabase
    .from("bank_transactions")
    .select(
      "id, amount, description, counterparty_name, transaction_date, deleted_at"
    )
    .eq("id", id)
    .is("deleted_at", null)
    .maybeSingle();
  if (txErr) return { success: false, error: txErr.message };
  if (!tx) return { success: false, error: "Movimento non trovato." };

  const { data: existing } = await supabase
    .from("bank_invoice_matches")
    .select("id")
    .eq("transaction_id", id)
    .is("deleted_at", null)
    .maybeSingle();
  if (existing?.id) {
    return {
      success: true,
      outcome: "already_linked",
      reason: "Movimento già collegato a una fattura.",
    };
  }

  if (
    isBankCommissionFee(
      Number(tx.amount) || 0,
      String(tx.description ?? "")
    )
  ) {
    return {
      success: true,
      outcome: "needs_browse",
      kind: invoiceKindFromBankAmount(Number(tx.amount) || 0) ?? "ricevuta",
      amountAbs: Math.abs(Number(tx.amount) || 0),
      txDate: String(tx.transaction_date),
      description: String(tx.description ?? ""),
      reason: "Movimento di commissioni bancarie: nessuna fattura da collegare.",
    };
  }

  const amount = Number(tx.amount) || 0;
  const kind = invoiceKindFromBankAmount(amount);
  if (!kind) {
    return { success: false, error: "Imposta prima il segno del movimento." };
  }
  const amountAbs = Math.abs(amount);
  const txDate = String(tx.transaction_date);
  const description = String(tx.description ?? "");
  const counterparty = String(tx.counterparty_name ?? "");
  const used = await loadUsedPayments(supabase);
  const invoices = await loadInvoiceCandidates(supabase);
  const cents = moneyCents(amountAbs);

  const amountMatches = invoices
    .filter((inv) => inv.kind === kind)
    .filter((inv) => isCandidateAvailable(inv, used))
    .filter((inv) => moneyCents(inv.amount_gross) === cents)
    .map((inv) => {
      const daysFromTx = daysAbs(txDate, inv.date);
      return {
        inv,
        daysFromTx,
        view: candidateToView(inv, txDate, amountAbs, description, counterparty),
      };
    })
    .filter((m) => {
      if (m.daysFromTx == null) return true;
      return m.daysFromTx <= BANK_RECONCILE_SEARCH_DAYS;
    })
    .sort((a, b) => {
      const da = a.daysFromTx ?? 9999;
      const db = b.daysFromTx ?? 9999;
      return da - db;
    });

  if (amountMatches.length === 0) {
    return {
      success: true,
      outcome: "needs_browse",
      kind,
      amountAbs,
      txDate,
      description,
      reason: `Nessuna fattura/rata con lo stesso importo entro ±${BANK_RECONCILE_SEARCH_DAYS} giorni.`,
    };
  }

  const near = amountMatches.filter(
    (m) => m.daysFromTx != null && m.daysFromTx <= BANK_RECONCILE_NEAR_DAYS
  );
  const far = amountMatches.filter(
    (m) => m.daysFromTx == null || m.daysFromTx > BANK_RECONCILE_NEAR_DAYS
  );

  if (near.length === 1) {
    const autoPick = near[0]!;
    const linked = await insertBankMatch({
      supabase,
      userId: auth.userId,
      transactionId: id,
      invoiceId: autoPick.inv.id,
      invoiceKind: autoPick.inv.kind,
      dilazioneId: autoPick.inv.dilazioneId,
      score: 90,
      mode: "auto",
      invoiceNumber: autoPick.inv.number,
    });
    if (!linked.success) return linked;
    return {
      success: true,
      outcome: "matched",
      matchId: linked.matchId,
      invoiceId: autoPick.inv.id,
      invoiceNumber: autoPick.inv.number,
      score: 90,
    };
  }

  if (near.length > 1) {
    return {
      success: true,
      outcome: "needs_choice",
      candidates: near.map((m) => m.view),
      kind,
      amountAbs,
      txDate,
      description,
    };
  }

  // Solo corrispondenze oltre ±15 gg (entro ±60): conferma operatore
  return {
    success: true,
    outcome: "needs_far_confirm",
    candidates: far.map((m) => m.view),
    kind,
    amountAbs,
    txDate,
    description,
    counterparty,
  };
}

/**
 * Elenco gerarchico fatture + dilazioni (checkbox una sola rata) nel range date.
 * Include sempre i gruppi con importo rata/totale uguale al movimento (anche fuori range).
 */
export async function listBankReconcileBrowseAction(input: {
  transactionId: string;
  halfWindowDays: number;
}): Promise<
  | {
      success: true;
      kind: "emessa" | "ricevuta";
      amountAbs: number;
      txDate: string;
      dateFrom: string;
      dateTo: string;
      halfWindowDays: number;
      groups: BankReconcileInvoiceGroup[];
      /** compat: flattened amount-match candidates */
      items: BankReconcileCandidateView[];
    }
  | { success: false; error: string }
> {
  await requireAreaAccess("area-fiscale");
  const id = String(input.transactionId ?? "").trim();
  const half = Math.max(
    BANK_RECONCILE_BROWSE_STEP_DAYS,
    Math.floor(Number(input.halfWindowDays) || BANK_RECONCILE_BROWSE_STEP_DAYS)
  );
  if (!id) return { success: false, error: "Movimento non valido." };

  const supabase = await createClient();
  const { data: tx, error: txErr } = await supabase
    .from("bank_transactions")
    .select("id, amount, transaction_date, description, counterparty_name")
    .eq("id", id)
    .is("deleted_at", null)
    .maybeSingle();
  if (txErr) return { success: false, error: txErr.message };
  if (!tx) return { success: false, error: "Movimento non trovato." };

  const amount = Number(tx.amount) || 0;
  const kind = invoiceKindFromBankAmount(amount);
  if (!kind) {
    return { success: false, error: "Imposta prima il segno del movimento." };
  }
  const amountAbs = Math.abs(amount);
  const txDate = String(tx.transaction_date);
  const dateFrom = addDaysIso(txDate, -half);
  const dateTo = addDaysIso(txDate, half);
  const description = String(tx.description ?? "");
  const counterparty = String(tx.counterparty_name ?? "");

  let allGroups: BankReconcileInvoiceGroup[];
  try {
    allGroups = await loadReconcileInvoiceGroups(supabase, kind, amountAbs);
  } catch (e) {
    return {
      success: false,
      error: e instanceof Error ? e.message : "Caricamento fatture fallito.",
    };
  }

  const inRange = (d: string | null) =>
    Boolean(d && d.slice(0, 10) >= dateFrom && d.slice(0, 10) <= dateTo);

  const scored = allGroups
    .map((g) => {
      const entityScore = scoreEntityInCausale(
        g.entityName,
        description,
        counterparty
      );
      const dilazioni = g.hasDilazioni
        ? g.dilazioni.filter((d) => !d.alreadyMatched)
        : [];
      const dilInRangeOrMatch = dilazioni.some(
        (d) => d.amountMatch || inRange(d.dataScadenza)
      );
      const keep =
        g.amountMatchFull ||
        dilInRangeOrMatch ||
        inRange(g.dataEmissione) ||
        entityScore >= 12;
      if (!keep) return null;
      return {
        group: { ...g, dilazioni } satisfies BankReconcileInvoiceGroup,
        entityScore,
      };
    })
    .filter(
      (x): x is { group: BankReconcileInvoiceGroup; entityScore: number } =>
        Boolean(x)
    );

  scored.sort((a, b) => {
    const aHit =
      a.group.amountMatchFull || a.group.dilazioni.some((d) => d.amountMatch)
        ? 1
        : 0;
    const bHit =
      b.group.amountMatchFull || b.group.dilazioni.some((d) => d.amountMatch)
        ? 1
        : 0;
    if (bHit !== aHit) return bHit - aHit;
    if (b.entityScore !== a.entityScore) return b.entityScore - a.entityScore;
    return (b.group.dataEmissione ?? "").localeCompare(
      a.group.dataEmissione ?? ""
    );
  });

  const groups = scored.map((s) => s.group);

  // Flatten amount-match for choice step compat
  const items: BankReconcileCandidateView[] = [];
  for (const g of groups) {
    if (g.fullSelectable && g.amountMatchFull) {
      items.push({
        id: g.invoiceId,
        candidateKey: g.invoiceId,
        dilazioneId: null,
        isDilazione: false,
        kind: g.kind,
        type: g.type,
        ficId: g.ficId,
        number: g.number,
        entityName: g.entityName,
        amountGross: g.totale,
        date: g.dataEmissione,
        status: g.status,
        daysFromTx: daysAbs(txDate, g.dataEmissione),
        amountMatch: true,
        entityScore: scoreEntityInCausale(g.entityName, description, counterparty),
      });
    }
    for (const d of g.dilazioni) {
      if (!d.amountMatch || d.alreadyMatched) continue;
      items.push({
        id: g.invoiceId,
        candidateKey: d.dilazioneId,
        dilazioneId: d.dilazioneId,
        isDilazione: true,
        kind: g.kind,
        type: g.type,
        ficId: g.ficId,
        number: `${g.number} · rata ${d.sortOrder + 1}`,
        entityName: g.entityName,
        amountGross: d.importo,
        date: d.dataScadenza,
        status: d.statoPagamento,
        daysFromTx: daysAbs(txDate, d.dataScadenza),
        amountMatch: true,
        entityScore: scoreEntityInCausale(g.entityName, description, counterparty),
      });
    }
  }

  return {
    success: true,
    kind,
    amountAbs,
    txDate,
    dateFrom,
    dateTo,
    halfWindowDays: half,
    groups,
    items,
  };
}

/** Collegamento confermato dall’operatore (scelta o browse). */
export async function linkBankTransactionInvoiceAction(input: {
  transactionId: string;
  invoiceId: string;
  invoiceKind: "emessa" | "ricevuta";
  dilazioneId?: string | null;
  mode: "manual" | "choice";
}): Promise<
  | {
      success: true;
      matchId: string;
      invoiceNumber: string;
      score: number;
    }
  | { success: false; error: string }
> {
  const { auth } = await requireAreaAccess("area-fiscale");
  const txId = String(input.transactionId ?? "").trim();
  const invId = String(input.invoiceId ?? "").trim();
  const dilazioneId = input.dilazioneId
    ? String(input.dilazioneId).trim()
    : null;
  const kind = input.invoiceKind;
  if (!txId || !invId) {
    return { success: false, error: "Dati collegamento incompleti." };
  }
  if (kind !== "emessa" && kind !== "ricevuta") {
    return { success: false, error: "Tipo fattura non valido." };
  }

  const supabase = await createClient();
  const { data: tx, error: txErr } = await supabase
    .from("bank_transactions")
    .select("id, amount, description, counterparty_name, transaction_date")
    .eq("id", txId)
    .is("deleted_at", null)
    .maybeSingle();
  if (txErr) return { success: false, error: txErr.message };
  if (!tx) return { success: false, error: "Movimento non trovato." };

  const expected = invoiceKindFromBankAmount(Number(tx.amount) || 0);
  if (expected && expected !== kind) {
    return {
      success: false,
      error:
        kind === "emessa"
          ? "Movimento in uscita (−): seleziona una fattura ricevuta."
          : "Movimento in entrata (+): seleziona una fattura emessa.",
    };
  }

  const { data: existing } = await supabase
    .from("bank_invoice_matches")
    .select("id")
    .eq("transaction_id", txId)
    .is("deleted_at", null)
    .maybeSingle();
  if (existing?.id) {
    return { success: false, error: "Movimento già collegato a una fattura." };
  }

  const used = await loadUsedPayments(supabase);
  if (dilazioneId) {
    if (used.dilazioneIds.has(dilazioneId)) {
      return {
        success: false,
        error: "Questa rata è già collegata a un altro movimento.",
      };
    }
  } else if (used.fullInvoiceIds.has(invId)) {
    return {
      success: false,
      error: "Questa fattura è già collegata a un altro movimento.",
    };
  }

  const invoices = await loadInvoiceCandidates(supabase);
  const cand = invoices.find((c) => {
    if (c.id !== invId || c.kind !== kind) return false;
    if (dilazioneId) return c.dilazioneId === dilazioneId;
    return !c.dilazioneId;
  });
  if (!cand) {
    return {
      success: false,
      error: dilazioneId
        ? "Rata/dilazione non trovata o non più disponibile."
        : "Fattura non trovata o ha dilazioni: seleziona una rata.",
    };
  }

  let score = scoreBankInvoiceMatch({
    amount: Number(tx.amount) || 0,
    invoiceGross: cand.amount_gross,
    counterparty: String(tx.counterparty_name ?? ""),
    entityName: cand.entity_name,
    description: String(tx.description ?? ""),
    invoiceNumber: cand.number,
    txDate: String(tx.transaction_date),
    invoiceDate: cand.date,
    invoiceKind: kind,
  });
  if (
    moneyCents(Number(tx.amount) || 0) === moneyCents(cand.amount_gross) &&
    score < 50
  ) {
    score = 50;
  }
  if (score < 50) score = 50;

  const linked = await insertBankMatch({
    supabase,
    userId: auth.userId,
    transactionId: txId,
    invoiceId: invId,
    invoiceKind: kind,
    dilazioneId: cand.dilazioneId,
    score,
    mode: input.mode,
    invoiceNumber: cand.number,
  });
  if (!linked.success) return linked;
  return {
    success: true,
    matchId: linked.matchId,
    invoiceNumber: cand.number,
    score,
  };
}
