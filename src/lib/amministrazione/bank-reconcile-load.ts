import type { createClient } from "@/lib/supabase/server";

type Supabase = Awaited<ReturnType<typeof createClient>>;

export type FicInvoiceReconcileCandidate = {
  id: string;
  fic_id: number;
  type: string;
  number: string;
  entity_name: string;
  entity_vat?: string;
  amount_gross: number;
  date: string | null;
  status: string;
};

const PAGE = 1000;

/**
 * Carica TUTTE le fatture FiC attive (emesse + ricevute), con paginazione
 * oltre il limite default Supabase (1000).
 */
export async function loadAllFicInvoicesForReconcile(
  supabase: Supabase
): Promise<FicInvoiceReconcileCandidate[]> {
  const all: FicInvoiceReconcileCandidate[] = [];
  let from = 0;

  for (;;) {
    const { data, error } = await supabase
      .from("fic_invoices")
      .select(
        "id, fic_id, type, number, entity_name, entity_vat, amount_gross, date, status"
      )
      .is("deleted_at", null)
      .order("date", { ascending: false })
      .range(from, from + PAGE - 1);

    if (error) {
      throw new Error(`Caricamento fatture per conciliazione: ${error.message}`);
    }

    const batch = (data ?? []) as FicInvoiceReconcileCandidate[];
    all.push(...batch);
    if (batch.length < PAGE) break;
    from += PAGE;
  }

  return all;
}
