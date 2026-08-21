import type { createClient } from "@/lib/supabase/server";
import type { BankReconcileInvoiceKind } from "@/lib/amministrazione/bank-reconcile";

type Supabase = Awaited<ReturnType<typeof createClient>>;

/**
 * Unità di pagamento per riconciliazione:
 * - totale fattura se NON ci sono dilazioni attive
 * - singola rata se la fattura ha dilazioni (importo/data = rata)
 */
export type FicInvoiceReconcileCandidate = {
  id: string;
  /** Chiave univoca riga: fatturaId oppure dilazioneId */
  candidateKey: string;
  dilazioneId: string | null;
  isDilazione: boolean;
  type: "issued" | "received";
  kind: BankReconcileInvoiceKind;
  fic_id: number;
  number: string;
  entity_name: string;
  entity_vat?: string;
  /** Importo da confrontare (totale o rata). */
  amount_gross: number;
  /** Data da confrontare (emissione o scadenza rata). */
  date: string | null;
  status: string;
};

const PAGE = 1000;

function mapPagamentoStatus(raw: string | null | undefined): string {
  const s = String(raw ?? "")
    .trim()
    .toLowerCase();
  if (s === "pagato" || s === "paid") return "paid";
  if (s === "parziale" || s === "partially_paid" || s === "da_pagare") {
    return s === "da_pagare" ? "not_paid" : "partially_paid";
  }
  return "not_paid";
}

type DilRow = {
  id: string;
  fattura_id: string;
  data_scadenza: string;
  importo: number | string;
  stato_pagamento: string;
  sort_order: number;
  annullata_at?: string | null;
};

async function loadDilazioniByFattura(
  supabase: Supabase,
  table: "fatture_emesse_dilazioni" | "fatture_ricevute_dilazioni",
  fatturaIds: string[]
): Promise<Map<string, DilRow[]>> {
  const map = new Map<string, DilRow[]>();
  if (fatturaIds.length === 0) return map;

  const CHUNK = 200;
  for (let i = 0; i < fatturaIds.length; i += CHUNK) {
    const chunk = fatturaIds.slice(i, i + CHUNK);
    if (table === "fatture_emesse_dilazioni") {
      const { data, error } = await supabase
        .from("fatture_emesse_dilazioni")
        .select(
          "id, fattura_id, data_scadenza, importo, stato_pagamento, sort_order, annullata_at"
        )
        .in("fattura_id", chunk)
        .is("deleted_at", null)
        .eq("stato_pagamento", "da_pagare")
        .order("sort_order", { ascending: true });
      if (error) {
        throw new Error(`Caricamento dilazioni: ${error.message}`);
      }
      for (const raw of data ?? []) {
        const row = raw as DilRow;
        if (row.annullata_at) continue;
        const fid = String(row.fattura_id);
        const list = map.get(fid) ?? [];
        list.push(row);
        map.set(fid, list);
      }
    } else {
      const { data, error } = await supabase
        .from("fatture_ricevute_dilazioni")
        .select(
          "id, fattura_id, data_scadenza, importo, stato_pagamento, sort_order"
        )
        .in("fattura_id", chunk)
        .is("deleted_at", null)
        .eq("stato_pagamento", "da_pagare")
        .order("sort_order", { ascending: true });
      if (error) {
        throw new Error(`Caricamento dilazioni: ${error.message}`);
      }
      for (const raw of data ?? []) {
        const row = raw as DilRow;
        const fid = String(row.fattura_id);
        const list = map.get(fid) ?? [];
        list.push(row);
        map.set(fid, list);
      }
    }
  }
  return map;
}

/**
 * Carica unità di pagamento (fattura intera o rate) per riconciliazione.
 */
export async function loadAllFicInvoicesForReconcile(
  supabase: Supabase
): Promise<FicInvoiceReconcileCandidate[]> {
  const all: FicInvoiceReconcileCandidate[] = [];
  const emesseIds: string[] = [];
  const ricevuteIds: string[] = [];
  const emesseMeta: Array<{
    id: string;
    fic_id: number;
    number: string;
    entity_name: string;
    totale: number;
    date: string | null;
    status: string;
  }> = [];
  const ricevuteMeta: typeof emesseMeta = [];

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
        const id = String(row.id);
        emesseIds.push(id);
        emesseMeta.push({
          id,
          fic_id: Number(row.fic_id) || 0,
          number:
            String(row.numero_fattura ?? "").trim() ||
            String(row.numero_interno ?? "").trim(),
          entity_name: String(row.cliente_ragione_sociale ?? ""),
          totale: Math.abs(Number(row.totale) || 0),
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
        const id = String(row.id);
        ricevuteIds.push(id);
        ricevuteMeta.push({
          id,
          fic_id: Number(row.fic_id) || 0,
          number:
            String(row.numero_documento_esterno ?? "").trim() ||
            String(row.numero_interno ?? "").trim(),
          entity_name: String(row.fornitore_ragione_sociale ?? ""),
          totale: Math.abs(Number(row.totale) || 0),
          date: (row.data_emissione as string | null) ?? null,
          status: mapPagamentoStatus(row.stato_pagamento as string | null),
        });
      }
      if (batch.length < PAGE) break;
      from += PAGE;
    }
  }

  const [dilEmesse, dilRicevute] = await Promise.all([
    loadDilazioniByFattura(supabase, "fatture_emesse_dilazioni", emesseIds),
    loadDilazioniByFattura(supabase, "fatture_ricevute_dilazioni", ricevuteIds),
  ]);

  for (const meta of emesseMeta) {
    const dil = dilEmesse.get(meta.id) ?? [];
    if (dil.length > 0) {
      dil.forEach((d, idx) => {
        all.push({
          id: meta.id,
          candidateKey: String(d.id),
          dilazioneId: String(d.id),
          isDilazione: true,
          type: "issued",
          kind: "emessa",
          fic_id: meta.fic_id,
          number: `${meta.number} · rata ${idx + 1}`,
          entity_name: meta.entity_name,
          amount_gross: Math.abs(Number(d.importo) || 0),
          date: d.data_scadenza ?? null,
          status: mapPagamentoStatus(d.stato_pagamento),
        });
      });
    } else {
      all.push({
        id: meta.id,
        candidateKey: meta.id,
        dilazioneId: null,
        isDilazione: false,
        type: "issued",
        kind: "emessa",
        fic_id: meta.fic_id,
        number: meta.number,
        entity_name: meta.entity_name,
        amount_gross: meta.totale,
        date: meta.date,
        status: meta.status,
      });
    }
  }

  for (const meta of ricevuteMeta) {
    const dil = dilRicevute.get(meta.id) ?? [];
    if (dil.length > 0) {
      dil.forEach((d, idx) => {
        all.push({
          id: meta.id,
          candidateKey: String(d.id),
          dilazioneId: String(d.id),
          isDilazione: true,
          type: "received",
          kind: "ricevuta",
          fic_id: meta.fic_id,
          number: `${meta.number} · rata ${idx + 1}`,
          entity_name: meta.entity_name,
          amount_gross: Math.abs(Number(d.importo) || 0),
          date: d.data_scadenza ?? null,
          status: mapPagamentoStatus(d.stato_pagamento),
        });
      });
    } else {
      all.push({
        id: meta.id,
        candidateKey: meta.id,
        dilazioneId: null,
        isDilazione: false,
        type: "received",
        kind: "ricevuta",
        fic_id: meta.fic_id,
        number: meta.number,
        entity_name: meta.entity_name,
        amount_gross: meta.totale,
        date: meta.date,
        status: meta.status,
      });
    }
  }

  return all;
}
