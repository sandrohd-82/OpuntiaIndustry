"use server";

import { writeAuditLog } from "@/lib/audit";
import { importBankStatementPdf } from "@/lib/amministrazione/bank-import";
import { syncBankReportsFromFic } from "@/lib/amministrazione/bank-sync";
import { requireAreaAccess } from "@/lib/areas/guard";
import { createClient } from "@/lib/supabase/server";
import { z } from "zod";

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

export async function importBankStatementPdfAction(
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
    return { success: false, error: "Seleziona un file CSV." };
  }
  const nameLower = file.name.toLowerCase();
  const isCsv =
    nameLower.endsWith(".csv") ||
    nameLower.endsWith(".cvs") ||
    file.type === "text/csv" ||
    file.type === "application/vnd.ms-excel" ||
    file.type === "text/plain";
  if (!isCsv) {
    return {
      success: false,
      error: "Estensione richiesta: .csv (accettato anche .cvs).",
    };
  }
  if (file.size > 15 * 1024 * 1024) {
    return { success: false, error: "CSV troppo grande (max 15 MB)." };
  }

  const accountName = String(formData.get("accountName") ?? "").trim() ||
    "BCC Don Rizzo";

  try {
    const buffer = Buffer.from(await file.arrayBuffer());
    const supabase = await createClient();
    const result = await importBankStatementPdf({
      supabase,
      userId: auth.userId,
      fileName: file.name,
      buffer,
      accountName,
    });

    await writeAuditLog({
      entity_type: "bank_import_batches",
      entity_id: result.batchId,
      action: "create",
      actor_id: auth.userId,
      summary: `Import CSV estratto conto «${file.name}»: ${result.rowsImported} nuovi / ${result.rowsTotal} rilevati`,
      payload: result,
    });

    if (result.rowsTotal === 0) {
      return {
        success: false,
        error:
          result.notes ||
          "Nessun movimento riconosciuto nel CSV. Attese 5 colonne fisse: Data;Data Valuta;Uscite;Entrate;Causale.",
      };
    }

    return { success: true, ...result };
  } catch (e) {
    console.error("[bank csv import]", e);
    return {
      success: false,
      error: e instanceof Error ? e.message : "Import CSV fallito.",
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
      match_score: number;
      status: string;
    }
  >();

  if (txIds.length > 0) {
    const { data: matches } = await supabase
      .from("bank_invoice_matches")
      .select("id, transaction_id, invoice_id, match_score, status")
      .in("transaction_id", txIds)
      .is("deleted_at", null);
    for (const m of matches ?? []) {
      const tid = String(m.transaction_id);
      const prev = matchByTx.get(tid);
      if (!prev || Number(m.match_score) > prev.match_score) {
        matchByTx.set(tid, {
          id: String(m.id),
          invoice_id: String(m.invoice_id),
          match_score: Number(m.match_score) || 0,
          status: String(m.status),
        });
      }
    }
  }

  const invoiceIds = [...new Set([...matchByTx.values()].map((m) => m.invoice_id))];
  const invoiceById = new Map<
    string,
    {
      fic_id: number;
      number: string;
      type: string;
      amount_gross: number;
      entity_name: string;
      entity_vat: string;
      date: string | null;
      status: string;
    }
  >();
  if (invoiceIds.length > 0) {
    const { data: invs } = await supabase
      .from("fic_invoices")
      .select(
        "id, fic_id, number, type, amount_gross, entity_name, entity_vat, date, status"
      )
      .in("id", invoiceIds)
      .is("deleted_at", null);
    for (const i of invs ?? []) {
      invoiceById.set(String(i.id), {
        fic_id: Number(i.fic_id) || 0,
        number: String(i.number ?? ""),
        type: String(i.type ?? ""),
        amount_gross: Number(i.amount_gross) || 0,
        entity_name: String(i.entity_name ?? ""),
        entity_vat: String(i.entity_vat ?? ""),
        date: (i.date as string | null) ?? null,
        status: String(i.status ?? ""),
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
    items = items.filter((i) => !i.match || i.match.status === "discrepancy");
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
