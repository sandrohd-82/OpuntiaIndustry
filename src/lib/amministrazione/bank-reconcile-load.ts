import type { createClient } from "@/lib/supabase/server";
import type { BankReconcileInvoiceKind } from "@/lib/amministrazione/bank-reconcile";

type Supabase = Awaited<ReturnType<typeof createClient>>;

export type FicInvoiceReconcileCandidate = {
  id: string;
  /** Compat UI / match: issued|received */
  type: "issued" | "received";
  /** Catalogo interno ISO */
  kind: BankReconcileInvoiceKind;
  fic_id: number;
  number: string;
  entity_name: string;
  entity_vat?: string;
  amount_gross: number;
  date: string | null;
  status: string;
};

const PAGE = 1000;

function mapPagamentoStatus(raw: string | null | undefined): string {
  const s = String(raw ?? "")
    .trim()
    .toLowerCase();
  if (s === "pagato" || s === "paid") return "paid";
  if (s === "parziale" || s === "partially_paid") return "partially_paid";
  return "not_paid";
}

/**
 * Carica fatture operative per riconciliazione:
 * - fatture_emesse (incassi / movimenti +)
 * - fatture_ricevute (pagamenti / movimenti −)
 * Paginazione oltre il limite default Supabase (1000).
 */
export async function loadAllFicInvoicesForReconcile(
  supabase: Supabase
): Promise<FicInvoiceReconcileCandidate[]> {
  const all: FicInvoiceReconcileCandidate[] = [];

  // Emesse
  {
    let from = 0;
    for (;;) {
      const { data, error } = await supabase
        .from("fatture_emesse")
        .select(
          "id, fic_id, numero_interno, numero_fattura, cliente_ragione_sociale, totale, data_emissione, stato_pagamento"
        )
        .is("deleted_at", null)
        .order("data_emissione", { ascending: false })
        .range(from, from + PAGE - 1);
      if (error) {
        throw new Error(
          `Caricamento fatture emesse per conciliazione: ${error.message}`
        );
      }
      const batch = data ?? [];
      for (const row of batch) {
        const numero =
          String(row.numero_fattura ?? "").trim() ||
          String(row.numero_interno ?? "").trim();
        all.push({
          id: String(row.id),
          type: "issued",
          kind: "emessa",
          fic_id: Number(row.fic_id) || 0,
          number: numero,
          entity_name: String(row.cliente_ragione_sociale ?? ""),
          amount_gross: Math.abs(Number(row.totale) || 0),
          date: (row.data_emissione as string | null) ?? null,
          status: mapPagamentoStatus(row.stato_pagamento as string | null),
        });
      }
      if (batch.length < PAGE) break;
      from += PAGE;
    }
  }

  // Ricevute
  {
    let from = 0;
    for (;;) {
      const { data, error } = await supabase
        .from("fatture_ricevute")
        .select(
          "id, fic_id, numero_interno, numero_documento_esterno, fornitore_ragione_sociale, totale, data_emissione, stato_pagamento"
        )
        .is("deleted_at", null)
        .order("data_emissione", { ascending: false })
        .range(from, from + PAGE - 1);
      if (error) {
        throw new Error(
          `Caricamento fatture ricevute per conciliazione: ${error.message}`
        );
      }
      const batch = data ?? [];
      for (const row of batch) {
        const numero =
          String(row.numero_documento_esterno ?? "").trim() ||
          String(row.numero_interno ?? "").trim();
        all.push({
          id: String(row.id),
          type: "received",
          kind: "ricevuta",
          fic_id: Number(row.fic_id) || 0,
          number: numero,
          entity_name: String(row.fornitore_ragione_sociale ?? ""),
          amount_gross: Math.abs(Number(row.totale) || 0),
          date: (row.data_emissione as string | null) ?? null,
          status: mapPagamentoStatus(row.stato_pagamento as string | null),
        });
      }
      if (batch.length < PAGE) break;
      from += PAGE;
    }
  }

  return all;
}
