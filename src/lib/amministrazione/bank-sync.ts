import {
  fetchFicCashbook,
  fetchFicPaidDocumentPayments,
  fetchFicPaymentAccounts,
  type FicCashbookEntry,
} from "@/lib/fic";
import {
  BANK_RECONCILE_MIN_SCORE,
  scoreBankInvoiceMatch,
} from "@/lib/amministrazione/bank-reconcile";
import { loadAllFicInvoicesForReconcile } from "@/lib/amministrazione/bank-reconcile-load";
import type { createClient } from "@/lib/supabase/server";

type Supabase = Awaited<ReturnType<typeof createClient>>;

export type BankSyncResult = {
  fetched: number;
  upserted: number;
  matched: number;
  invoicesMarkedPaid: number;
  accountName: string;
  fromCashbook: number;
  fromDocumentPayments: number;
  skippedNoDate: number;
};

function resolveAccountName(
  entries: FicCashbookEntry[],
  accounts: Awaited<ReturnType<typeof fetchFicPaymentAccounts>>
): string {
  const preferred = accounts.find((a) =>
    /don\s*rizzo|bcc|ts\s*pay|banca/i.test(a.name)
  );
  if (preferred) return preferred.name;
  const fromEntry = entries.find((e) => e.paymentAccountName)?.paymentAccountName;
  return fromEntry || "BCC Don Rizzo";
}

/** Sincronizza cashbook FiC → bank_transactions + match su fatture interne. */
export async function syncBankReportsFromFic(input: {
  supabase: Supabase;
  userId: string | null;
  dateFrom: string;
  dateTo: string;
  /** Se true, limita al conto BCC/TS Pay se trovato; default: tutti i conti. */
  onlyPreferredBank?: boolean;
}): Promise<BankSyncResult> {
  const accounts = await fetchFicPaymentAccounts().catch(() => []);
  const preferred = accounts.find((a) =>
    /don\s*rizzo|bcc/i.test(a.name)
  );

  const [cashbookEntries, documentPayments] = await Promise.all([
    fetchFicCashbook({
      dateFrom: input.dateFrom,
      dateTo: input.dateTo,
      paymentAccountId:
        input.onlyPreferredBank && preferred?.id ? preferred.id : undefined,
    }),
    fetchFicPaidDocumentPayments({
      dateFrom: input.dateFrom,
      dateTo: input.dateTo,
    }).catch((e) => {
      console.error("[bank sync document payments]", e);
      return [] as FicCashbookEntry[];
    }),
  ]);

  // Unisci: cashbook prima; aggiungi pagamenti documenti non già coperti
  const mergedByFicId = new Map<string, FicCashbookEntry>();
  for (const e of cashbookEntries) {
    mergedByFicId.set(e.ficId, e);
  }
  for (const e of documentPayments) {
    const clash = [...mergedByFicId.values()].find(
      (c) =>
        Boolean(c.documentId) &&
        Boolean(e.documentId) &&
        c.documentId === e.documentId &&
        c.date === e.date &&
        Math.abs(Math.abs(c.amount) - Math.abs(e.amount)) < 0.02
    );
    if (clash) continue;
    if (!mergedByFicId.has(e.ficId)) mergedByFicId.set(e.ficId, e);
  }
  const entries = [...mergedByFicId.values()];
  const accountName = resolveAccountName(entries, accounts);

  type Inv = Awaited<ReturnType<typeof loadAllFicInvoicesForReconcile>>[number];
  const invRows = await loadAllFicInvoicesForReconcile(input.supabase);

  let upserted = 0;
  let matched = 0;
  let invoicesMarkedPaid = 0;
  let skippedNoDate = 0;
  const paidInvoiceIds = new Set<string>();

  for (const entry of entries) {
    if (!entry.date) {
      skippedNoDate += 1;
      continue;
    }
    const ficPaymentId =
      entry.ficId.startsWith("docpay:") || entry.ficId.startsWith("cashbook:")
        ? entry.ficId
        : `cashbook:${entry.ficId}`;

    const { data: existing } = await input.supabase
      .from("bank_transactions")
      .select("id")
      .eq("fic_payment_id", ficPaymentId)
      .is("deleted_at", null)
      .maybeSingle();

    const row = {
      fic_payment_id: ficPaymentId,
      account_name: entry.paymentAccountName || accountName,
      transaction_date: entry.date,
      valuta_date: entry.date,
      amount: entry.amount,
      description: entry.description,
      counterparty_name: entry.entityName,
      counterparty_vat: "",
      raw_data: entry.raw,
      updated_by: input.userId,
    };

    let transactionId: string;
    if (existing?.id) {
      const { error } = await input.supabase
        .from("bank_transactions")
        .update(row)
        .eq("id", existing.id);
      if (error) throw new Error(error.message);
      transactionId = String(existing.id);
    } else {
      const { data: inserted, error } = await input.supabase
        .from("bank_transactions")
        .insert({ ...row, created_by: input.userId })
        .select("id")
        .single();
      if (error) throw new Error(error.message);
      transactionId = String(inserted.id);
      upserted += 1;
    }

    // Match preferenziale per document_id FiC (se importo+data ok)
    let best: { inv: Inv; score: number } | null = null;
    if (entry.documentId) {
      const byDoc = invRows.find((i) => i.fic_id === entry.documentId);
      if (byDoc) {
        const score = scoreBankInvoiceMatch({
          amount: entry.amount,
          invoiceGross: Number(byDoc.amount_gross),
          counterparty: entry.entityName,
          entityName: byDoc.entity_name,
          description: entry.description,
          invoiceNumber: byDoc.number,
          txDate: entry.date,
          invoiceDate: byDoc.date,
          invoiceKind: byDoc.kind,
        });
        if (score >= BANK_RECONCILE_MIN_SCORE) {
          best = { inv: byDoc, score: Math.max(score, 90) };
        }
      }
    }

    if (!best) {
      for (const inv of invRows) {
        const score = scoreBankInvoiceMatch({
          amount: entry.amount,
          invoiceGross: Number(inv.amount_gross),
          counterparty: entry.entityName,
          entityName: inv.entity_name,
          description: entry.description,
          invoiceNumber: inv.number,
          txDate: entry.date,
          invoiceDate: inv.date,
          invoiceKind: inv.kind,
        });
        if (score < BANK_RECONCILE_MIN_SCORE) continue;
        if (!best || score > best.score) best = { inv, score };
      }
    }

    if (best) {
      const status = "auto_matched";

      const { data: existingMatch } = await input.supabase
        .from("bank_invoice_matches")
        .select("id, status")
        .eq("transaction_id", transactionId)
        .eq("invoice_id", best.inv.id)
        .is("deleted_at", null)
        .maybeSingle();

      if (existingMatch?.id) {
        if (existingMatch.status !== "manually_verified") {
          await input.supabase
            .from("bank_invoice_matches")
            .update({
              match_score: best.score,
              invoice_kind: best.inv.kind,
              dilazione_id: best.inv.dilazioneId,
              status,
            })
            .eq("id", existingMatch.id);
        }
      } else {
        await input.supabase.from("bank_invoice_matches").insert({
          transaction_id: transactionId,
          invoice_id: best.inv.id,
          invoice_kind: best.inv.kind,
          dilazione_id: best.inv.dilazioneId,
          match_score: best.score,
          status,
          created_by: input.userId,
        });
        matched += 1;
      }

      if (best.inv.dilazioneId) {
        const dilTable =
          best.inv.kind === "ricevuta"
            ? "fatture_ricevute_dilazioni"
            : "fatture_emesse_dilazioni";
        await input.supabase
          .from(dilTable)
          .update({
            stato_pagamento: "pagato",
            updated_by: input.userId,
          })
          .eq("id", best.inv.dilazioneId)
          .is("deleted_at", null);
      } else if (best.inv.status !== "paid") {
        paidInvoiceIds.add(`${best.inv.kind}:${best.inv.id}`);
      }
    }
  }

  for (const key of paidInvoiceIds) {
    const [kind, invoiceId] = key.split(":");
    const table =
      kind === "ricevuta" ? "fatture_ricevute" : "fatture_emesse";
    const { error } = await input.supabase
      .from(table)
      .update({
        stato_pagamento: "pagato",
        updated_by: input.userId,
      })
      .eq("id", invoiceId)
      .is("deleted_at", null);
    if (!error) invoicesMarkedPaid += 1;
  }

  return {
    fetched: entries.length,
    upserted,
    matched,
    invoicesMarkedPaid,
    accountName,
    fromCashbook: cashbookEntries.length,
    fromDocumentPayments: documentPayments.length,
    skippedNoDate,
  };
}
