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
    return { success: false, error: "Seleziona un file PDF." };
  }
  if (file.type && file.type !== "application/pdf") {
    return { success: false, error: "Il file deve essere un PDF." };
  }
  if (!file.name.toLowerCase().endsWith(".pdf")) {
    return { success: false, error: "Estensione richiesta: .pdf" };
  }
  if (file.size > 15 * 1024 * 1024) {
    return { success: false, error: "PDF troppo grande (max 15 MB)." };
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
      summary: `Import PDF estratto conto «${file.name}»: ${result.rowsImported} nuovi / ${result.rowsTotal} rilevati`,
      payload: result,
    });

    if (result.rowsTotal === 0) {
      return {
        success: false,
        error:
          result.notes ||
          "Nessun movimento riconosciuto nel PDF. Verifica OPENAI_API_KEY su Vercel (Production) e ridéploya.",
      };
    }

    return { success: true, ...result };
  } catch (e) {
    console.error("[bank pdf import]", e);
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
  | { success: true; items: BankTransactionView[]; pendingSignCount: number }
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
  let q = supabase
    .from("bank_transactions")
    .select("*")
    .is("deleted_at", null)
    .gte("transaction_date", parsed.data.dateFrom)
    .lte("transaction_date", parsed.data.dateTo)
    .order("sign_needs_review", { ascending: false })
    .order("transaction_date", { ascending: false });

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

  const pendingSignCount =
    input.tipo === "da_confermare"
      ? items.length
      : items.filter((i) => i.signNeedsReview).length;

  // Se filtro entrate/uscite, ricalcola pending sul periodo completo
  let pendingInPeriod = pendingSignCount;
  if (input.tipo !== "da_confermare" && input.tipo !== "tutti") {
    const { count } = await supabase
      .from("bank_transactions")
      .select("id", { count: "exact", head: true })
      .is("deleted_at", null)
      .gte("transaction_date", parsed.data.dateFrom)
      .lte("transaction_date", parsed.data.dateTo)
      .eq("sign_needs_review", true);
    pendingInPeriod = count ?? 0;
  } else if (input.tipo === "tutti") {
    pendingInPeriod = items.filter((i) => i.signNeedsReview).length;
  }

  return { success: true, items, pendingSignCount: pendingInPeriod };
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
