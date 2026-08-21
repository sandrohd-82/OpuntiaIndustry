import type { createClient } from "@/lib/supabase/server";
import type { BankReconcileInvoiceKind } from "@/lib/amministrazione/bank-reconcile";

type Supabase = Awaited<ReturnType<typeof createClient>>;

/**
 * Unità di pagamento per riconciliazione:
 * - totale fattura se NON esistono dilazioni sulla fattura
 * - singola rata (anche se già «pagato» in anagrafica, finché non è in bank_invoice_matches)
 */
export type FicInvoiceReconcileCandidate = {
  id: string;
  candidateKey: string;
  dilazioneId: string | null;
  isDilazione: boolean;
  type: "issued" | "received";
  kind: BankReconcileInvoiceKind;
  fic_id: number;
  number: string;
  entity_name: string;
  entity_vat?: string;
  amount_gross: number;
  date: string | null;
  status: string;
  dilazioneSortOrder: number;
};

export type BankReconcileInvoiceGroup = {
  invoiceId: string;
  kind: BankReconcileInvoiceKind;
  type: "issued" | "received";
  number: string;
  entityName: string;
  totale: number;
  dataEmissione: string | null;
  status: string;
  hasDilazioni: boolean;
  /** Selezionabile solo se non ci sono dilazioni. */
  fullSelectable: boolean;
  amountMatchFull: boolean;
  dilazioni: Array<{
    dilazioneId: string;
    sortOrder: number;
    importo: number;
    dataScadenza: string | null;
    statoPagamento: string;
    amountMatch: boolean;
    alreadyMatched: boolean;
  }>;
};

const PAGE = 1000;

function mapPagamentoStatus(raw: string | null | undefined): string {
  const s = String(raw ?? "")
    .trim()
    .toLowerCase();
  if (s === "pagato" || s === "paid") return "paid";
  if (s === "parziale" || s === "partially_paid") return "partially_paid";
  if (s === "da_pagare") return "not_paid";
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

async function loadUsedDilazioneIds(supabase: Supabase): Promise<Set<string>> {
  const { data } = await supabase
    .from("bank_invoice_matches")
    .select("dilazione_id")
    .is("deleted_at", null)
    .not("dilazione_id", "is", null);
  return new Set(
    (data ?? [])
      .map((r) => (r.dilazione_id ? String(r.dilazione_id) : ""))
      .filter(Boolean)
  );
}

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
        .order("sort_order", { ascending: true });
      if (error) throw new Error(`Caricamento dilazioni: ${error.message}`);
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
        .order("sort_order", { ascending: true });
      if (error) throw new Error(`Caricamento dilazioni: ${error.message}`);
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

type Meta = {
  id: string;
  fic_id: number;
  number: string;
  entity_name: string;
  totale: number;
  date: string | null;
  status: string;
};

/**
 * Carica unità di pagamento (fattura intera o rate non ancora riconciliate in banca).
 * Una sola rata basta: non serve che tutte le dilazioni siano aperte.
 */
export async function loadAllFicInvoicesForReconcile(
  supabase: Supabase
): Promise<FicInvoiceReconcileCandidate[]> {
  const all: FicInvoiceReconcileCandidate[] = [];
  const emesseIds: string[] = [];
  const ricevuteIds: string[] = [];
  const emesseMeta: Meta[] = [];
  const ricevuteMeta: Meta[] = [];

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

  const [dilEmesse, dilRicevute, usedDil] = await Promise.all([
    loadDilazioniByFattura(supabase, "fatture_emesse_dilazioni", emesseIds),
    loadDilazioniByFattura(supabase, "fatture_ricevute_dilazioni", ricevuteIds),
    loadUsedDilazioneIds(supabase),
  ]);

  function pushMeta(
    meta: Meta,
    kind: BankReconcileInvoiceKind,
    type: "issued" | "received",
    dilMap: Map<string, DilRow[]>
  ) {
    const dilAll = dilMap.get(meta.id) ?? [];
    if (dilAll.length > 0) {
      // Solo rate non già collegate in banca (anche se stato=pagato in anagrafica)
      const available = dilAll.filter((d) => !usedDil.has(String(d.id)));
      available.forEach((d, idx) => {
        const ord = Number(d.sort_order) || idx;
        all.push({
          id: meta.id,
          candidateKey: String(d.id),
          dilazioneId: String(d.id),
          isDilazione: true,
          type,
          kind,
          fic_id: meta.fic_id,
          number: `${meta.number} · rata ${ord + 1}`,
          entity_name: meta.entity_name,
          amount_gross: Math.abs(Number(d.importo) || 0),
          date: d.data_scadenza ?? null,
          status: mapPagamentoStatus(d.stato_pagamento),
          dilazioneSortOrder: ord,
        });
      });
      return;
    }
    all.push({
      id: meta.id,
      candidateKey: meta.id,
      dilazioneId: null,
      isDilazione: false,
      type,
      kind,
      fic_id: meta.fic_id,
      number: meta.number,
      entity_name: meta.entity_name,
      amount_gross: meta.totale,
      date: meta.date,
      status: meta.status,
      dilazioneSortOrder: 0,
    });
  }

  for (const meta of emesseMeta) {
    pushMeta(meta, "emessa", "issued", dilEmesse);
  }
  for (const meta of ricevuteMeta) {
    pushMeta(meta, "ricevuta", "received", dilRicevute);
  }

  return all;
}

function moneyCents(n: number): number {
  return Math.round(Math.abs(Number(n) || 0) * 100);
}

/** Gruppi fattura + dilazioni per UI manuale (checkbox rate). */
export async function loadReconcileInvoiceGroups(
  supabase: Supabase,
  kind: BankReconcileInvoiceKind,
  amountAbs: number
): Promise<BankReconcileInvoiceGroup[]> {
  const usedDil = await loadUsedDilazioneIds(supabase);
  const cents = moneyCents(amountAbs);
  const groups: BankReconcileInvoiceGroup[] = [];

  if (kind === "emessa") {
    const { data, error } = await supabase
      .from("fatture_emesse")
      .select(
        "id, numero_interno, numero_fattura, cliente_ragione_sociale, totale, data_emissione, stato_pagamento"
      )
      .is("deleted_at", null)
      .order("data_emissione", { ascending: false });
    if (error) throw new Error(error.message);
    const ids = (data ?? []).map((r) => String(r.id));
    const dilMap = await loadDilazioniByFattura(
      supabase,
      "fatture_emesse_dilazioni",
      ids
    );
    for (const row of data ?? []) {
      const id = String(row.id);
      const number =
        String(row.numero_fattura ?? "").trim() ||
        String(row.numero_interno ?? "").trim();
      const totale = Math.abs(Number(row.totale) || 0);
      const dilAll = dilMap.get(id) ?? [];
      const hasDilazioni = dilAll.length > 0;
      groups.push({
        invoiceId: id,
        kind: "emessa",
        type: "issued",
        number,
        entityName: String(row.cliente_ragione_sociale ?? ""),
        totale,
        dataEmissione: (row.data_emissione as string | null) ?? null,
        status: mapPagamentoStatus(row.stato_pagamento as string | null),
        hasDilazioni,
        fullSelectable: !hasDilazioni,
        amountMatchFull: !hasDilazioni && moneyCents(totale) === cents,
        dilazioni: dilAll.map((d, idx) => {
          const importo = Math.abs(Number(d.importo) || 0);
          const dilId = String(d.id);
          return {
            dilazioneId: dilId,
            sortOrder: Number(d.sort_order) || idx,
            importo,
            dataScadenza: d.data_scadenza ?? null,
            statoPagamento: String(d.stato_pagamento ?? ""),
            amountMatch: moneyCents(importo) === cents,
            alreadyMatched: usedDil.has(dilId),
          };
        }),
      });
    }
  } else {
    const { data, error } = await supabase
      .from("fatture_ricevute")
      .select(
        "id, numero_interno, numero_documento_esterno, fornitore_ragione_sociale, totale, data_emissione, stato_pagamento"
      )
      .is("deleted_at", null)
      .order("data_emissione", { ascending: false });
    if (error) throw new Error(error.message);
    const ids = (data ?? []).map((r) => String(r.id));
    const dilMap = await loadDilazioniByFattura(
      supabase,
      "fatture_ricevute_dilazioni",
      ids
    );
    for (const row of data ?? []) {
      const id = String(row.id);
      const number =
        String(row.numero_documento_esterno ?? "").trim() ||
        String(row.numero_interno ?? "").trim();
      const totale = Math.abs(Number(row.totale) || 0);
      const dilAll = dilMap.get(id) ?? [];
      const hasDilazioni = dilAll.length > 0;
      groups.push({
        invoiceId: id,
        kind: "ricevuta",
        type: "received",
        number,
        entityName: String(row.fornitore_ragione_sociale ?? ""),
        totale,
        dataEmissione: (row.data_emissione as string | null) ?? null,
        status: mapPagamentoStatus(row.stato_pagamento as string | null),
        hasDilazioni,
        fullSelectable: !hasDilazioni,
        amountMatchFull: !hasDilazioni && moneyCents(totale) === cents,
        dilazioni: dilAll.map((d, idx) => {
          const importo = Math.abs(Number(d.importo) || 0);
          const dilId = String(d.id);
          return {
            dilazioneId: dilId,
            sortOrder: Number(d.sort_order) || idx,
            importo,
            dataScadenza: d.data_scadenza ?? null,
            statoPagamento: String(d.stato_pagamento ?? ""),
            amountMatch: moneyCents(importo) === cents,
            alreadyMatched: usedDil.has(dilId),
          };
        }),
      });
    }
  }

  return groups;
}
