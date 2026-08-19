"use server";

import { writeAuditLog } from "@/lib/audit";
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
  tipo?: "tutti" | "entrate" | "uscite" | "non_riconciliati";
}): Promise<
  | { success: true; items: BankTransactionView[] }
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
    .order("transaction_date", { ascending: false });

  if (input.tipo === "entrate") q = q.gt("amount", 0);
  if (input.tipo === "uscite") q = q.lt("amount", 0);

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

  return { success: true, items };
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
