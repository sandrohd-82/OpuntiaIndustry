"use server";

import {
  resolveStatsClienteIds,
  resolveStatsDateFloor,
} from "@/lib/auth/data-scope-enforce";
import { createClient, createServiceClient } from "@/lib/supabase/server";
import { includeInContabilitaFatturaEmessa } from "@/lib/amministrazione/fatture";
import {
  calcolaAndamentoMultiAnno,
  coloreAziendaByIndex,
  emptySerieAnno,
  emptySerieInteraVita,
  graficiIncassiFiltroSchema,
  graficiOrdiniFiltroSchema,
  graficiPeriodoSchema,
  graficiProvvigioniFiltroSchema,
  isInteraVita,
  labelProdottoGrafico,
  MESI_IT,
  type GraficiFonteIncassi,
  type GraficiIncassiDettaglio,
  type GraficiIncassiFiltro,
  type GraficiKpi,
  type GraficiMultiAnno,
  type GraficiOrdiniFiltro,
  type GraficiProvvigioniDettaglio,
  type GraficiProvvigioniFiltro,
} from "@/lib/amministrazione/grafici";
import { calcolaProvvigione, parseProvvigionePctInput } from "@/lib/auth/commerciale";
import { loadCommercialLineageUserIds } from "@/lib/auth/commerciale-lineage";
import { isSuperadminProfile } from "@/lib/auth/roles";
import { getAuthContext } from "@/lib/auth/session";

type ActionOk<T> = { success: true } & T;
type ActionFail = { success: false; error: string };

function dateRangeForYear(
  anno: number
): { from: string; to: string } | null {
  if (isInteraVita(anno)) return null;
  return {
    from: `${anno}-01-01`,
    to: `${anno}-12-31`,
  };
}

type DateFilterQuery = {
  gte: (column: string, value: string) => DateFilterQuery;
  lte: (column: string, value: string) => DateFilterQuery;
};

/** Applica filtro data solo se non è “Intera vita”. */
function applyClienteIds<T>(query: T, ids: string[] | null): T {
  if (!ids || ids.length === 0) return query;
  return (query as { in: (column: string, value: string[]) => T }).in(
    "cliente_id",
    ids
  );
}

function emptyKpi(anno: number): GraficiKpi {
  return isInteraVita(anno) ? emptySerieInteraVita() : emptySerieAnno(anno);
}

function emptyDettaglio(anno: number): GraficiIncassiDettaglio {
  const vita = isInteraVita(anno);
  return {
    anno,
    granularita: vita ? "anno" : "mese",
    totale: 0,
    aziende: [],
    mesi: [],
    andamentoAziende: [],
    periodiLabels: vita ? [] : [...MESI_IT],
    prodotti: [],
  };
}

function applyDateRange<T extends DateFilterQuery>(
  query: T,
  column: string,
  range: { from: string; to: string } | null,
  floor: string | null = null
): T {
  let q = query;
  if (range) {
    q = q.gte(column, range.from).lte(column, range.to) as T;
  }
  if (floor) {
    q = q.gte(column, floor) as T;
  }
  return q;
}

function roundMoney(v: number): number {
  return Math.round((v + Number.EPSILON) * 100) / 100;
}

function accumulateByMonth(
  anno: number,
  rows: { dateStr: string; amount: number }[],
  meseFilter: number | null | undefined
): GraficiKpi {
  const base = emptySerieAnno(anno);
  for (const row of rows) {
    if (!row.dateStr || row.dateStr.length < 7) continue;
    const m = Number(row.dateStr.slice(5, 7));
    if (!Number.isFinite(m) || m < 1 || m > 12) continue;
    if (meseFilter != null && m !== meseFilter) continue;
    base.serie[m - 1].valore += row.amount;
  }
  if (meseFilter != null) {
    base.serie = base.serie.filter((s) => s.mese === meseFilter);
  }
  base.totale = base.serie.reduce((acc, s) => acc + s.valore, 0);
  return base;
}

/** Intera vita: una barra/punto per anno solare (opz. filtro mese su tutti gli anni). */
function accumulateByYear(
  rows: { dateStr: string; amount: number }[],
  meseFilter: number | null | undefined
): GraficiKpi {
  const byYear = new Map<number, number>();
  for (const row of rows) {
    if (!row.dateStr || row.dateStr.length < 4) continue;
    const y = Number(row.dateStr.slice(0, 4));
    if (!Number.isFinite(y) || y < 1990 || y > 2100) continue;
    if (meseFilter != null) {
      const m = Number(row.dateStr.slice(5, 7));
      if (m !== meseFilter) continue;
    }
    byYear.set(y, (byYear.get(y) ?? 0) + row.amount);
  }
  const years = [...byYear.keys()].sort((a, b) => a - b);
  if (years.length === 0) return emptySerieInteraVita();
  const serie = years.map((y) => ({
    mese: y,
    label: String(y),
    valore: roundMoney(byYear.get(y) ?? 0),
  }));
  return {
    anno: 0,
    totale: roundMoney(serie.reduce((a, s) => a + s.valore, 0)),
    serie,
  };
}

function accumulatePeriodo(
  anno: number,
  rows: { dateStr: string; amount: number }[],
  meseFilter: number | null | undefined
): GraficiKpi {
  if (isInteraVita(anno)) return accumulateByYear(rows, meseFilter);
  return accumulateByMonth(anno, rows, meseFilter);
}

async function loadIncassiAnno(
  supabase: Awaited<ReturnType<typeof createClient>>,
  anno: number,
  mese: number | null | undefined,
  clienteId: string | null | undefined,
  fonte: GraficiFonteIncassi
): Promise<{ ok: true; data: GraficiKpi } | { ok: false; error: string }> {
  const range = dateRangeForYear(anno);
  const floor = await resolveStatsDateFloor();
  const aziende = await resolveStatsClienteIds(supabase, clienteId);
  if (aziende.empty) {
    return { ok: true, data: emptyKpi(anno) };
  }
  const rows: { dateStr: string; amount: number }[] = [];

  if (fonte === "fatture" || fonte === "entrambi") {
    let q = supabase
      .from("fatture_emesse")
      .select(
        "data_emissione, totale, cliente_id, tipo_documento, stato_pagamento, fattura_collegata_id, spedizione, spedizione_iva_applicata, spedizione_sottrai_incassi, iva_percentuale"
      )
      .is("deleted_at", null);
    q = applyDateRange(q, "data_emissione", range, floor);
    q = applyClienteIds(q, aziende.ids);
    const { data, error } = await q;
    if (error) {
      return {
        ok: false,
        error: `Incassi da fatture: ${error.message}`,
      };
    }
    for (const r of data ?? []) {
      const row = r as {
        tipo_documento?: string;
        stato_pagamento?: string;
        fattura_collegata_id?: string | null;
        totale?: number;
        data_emissione?: string;
      };
      if (!includeInContabilitaFatturaEmessa(row)) continue;
      const isNc = row.tipo_documento === "nota_credito";
      let amount = Number(row.totale) || 0;
      if (isNc) {
        // Totale NC già negativo; se positivo (legacy) forza segno
        amount = amount <= 0 ? amount : -Math.abs(amount);
      }
      rows.push({
        dateStr: String(row.data_emissione ?? ""),
        amount,
      });
    }
  }

  if (fonte === "ordini" || fonte === "entrambi") {
    let q = supabase
      .from("ordini")
      .select("data_ordine, importo_euro, cliente_id, pagato")
      .is("deleted_at", null)
      .eq("pagato", true);
    q = applyDateRange(q, "data_ordine", range, floor);
    q = applyClienteIds(q, aziende.ids);
    const { data, error } = await q;
    if (error) {
      return { ok: false, error: `Incassi da ordini: ${error.message}` };
    }
    for (const r of data ?? []) {
      rows.push({
        dateStr: String(r.data_ordine ?? ""),
        amount: Number(r.importo_euro) || 0,
      });
    }
  }

  return { ok: true, data: accumulatePeriodo(anno, rows, mese) };
}

async function loadIncassiDettaglioAnno(
  supabase: Awaited<ReturnType<typeof createClient>>,
  anno: number,
  mese: number | null | undefined,
  clienteId: string | null | undefined,
  fonte: GraficiFonteIncassi
): Promise<
  | { ok: true; data: GraficiIncassiDettaglio }
  | { ok: false; error: string }
> {
  const range = dateRangeForYear(anno);
  const floor = await resolveStatsDateFloor();
  const aziende = await resolveStatsClienteIds(supabase, clienteId);
  if (aziende.empty) {
    return { ok: true, data: emptyDettaglio(anno) };
  }
  type Row = {
    dateStr: string;
    amount: number;
    clienteId: string;
    clienteLabel: string;
    codiceTarga: string;
  };
  const rows: Row[] = [];
  const fatturaIds: string[] = [];

  if (fonte === "fatture" || fonte === "entrambi") {
    let q = supabase
      .from("fatture_emesse")
      .select(
        "id, data_emissione, totale, cliente_id, cliente_ragione_sociale, cliente_codice_targa, tipo_documento, stato_pagamento, fattura_collegata_id"
      )
      .is("deleted_at", null);
    q = applyDateRange(q, "data_emissione", range, floor);
    q = applyClienteIds(q, aziende.ids);
    const { data, error } = await q;
    if (error) {
      return { ok: false, error: `Incassi da fatture: ${error.message}` };
    }
    for (const r of data ?? []) {
      if (!includeInContabilitaFatturaEmessa(r)) continue;
      const cid = String(r.cliente_id ?? "");
      if (!cid) continue;
      const dateStr = String(r.data_emissione ?? "");
      const m = Number(dateStr.slice(5, 7));
      if (mese != null && m !== mese) continue;
      const isNc = r.tipo_documento === "nota_credito";
      let amount = Number(r.totale) || 0;
      if (isNc) amount = amount <= 0 ? amount : -Math.abs(amount);
      rows.push({
        dateStr,
        amount,
        clienteId: cid,
        clienteLabel: String(r.cliente_ragione_sociale ?? "Cliente"),
        codiceTarga: String(r.cliente_codice_targa ?? ""),
      });
      if (r.id && !isNc) fatturaIds.push(String(r.id));
    }
  }

  if (fonte === "ordini" || fonte === "entrambi") {
    let q = supabase
      .from("ordini")
      .select(
        "id, data_ordine, importo_euro, cliente_id, clienti(ragione_sociale, codice_targa)"
      )
      .is("deleted_at", null)
      .eq("pagato", true);
    q = applyDateRange(q, "data_ordine", range, floor);
    q = applyClienteIds(q, aziende.ids);
    const { data, error } = await q;
    if (error) {
      return { ok: false, error: `Incassi da ordini: ${error.message}` };
    }
    for (const r of data ?? []) {
      const cid = String(r.cliente_id ?? "");
      if (!cid) continue;
      const dateStr = String(r.data_ordine ?? "");
      const m = Number(dateStr.slice(5, 7));
      if (mese != null && m !== mese) continue;
      const cl = r.clienti as
        | { ragione_sociale?: string; codice_targa?: string }
        | null
        | undefined;
      rows.push({
        dateStr,
        amount: Number(r.importo_euro) || 0,
        clienteId: cid,
        clienteLabel: String(cl?.ragione_sociale ?? "Cliente"),
        codiceTarga: String(cl?.codice_targa ?? ""),
      });
    }
  }

  const aziendaMap = new Map<
    string,
    { label: string; codiceTarga: string; totale: number }
  >();
  for (const r of rows) {
    const prev = aziendaMap.get(r.clienteId);
    if (prev) {
      prev.totale += r.amount;
    } else {
      aziendaMap.set(r.clienteId, {
        label: r.clienteLabel,
        codiceTarga: r.codiceTarga,
        totale: r.amount,
      });
    }
  }

  const aziendeSorted = [...aziendaMap.entries()]
    .sort((a, b) => b[1].totale - a[1].totale)
    .map(([id, meta], index) => ({
      id,
      label: meta.codiceTarga
        ? `${meta.codiceTarga} — ${meta.label}`
        : meta.label,
      codiceTarga: meta.codiceTarga,
      color: coloreAziendaByIndex(index),
    }));

  const indexById = new Map(aziendeSorted.map((a, i) => [a.id, i]));
  const vita = isInteraVita(anno);
  const granularita = vita ? ("anno" as const) : ("mese" as const);

  let periodiList: { key: number; label: string }[];
  if (vita) {
    const years = new Set<number>();
    for (const r of rows) {
      const y = Number(r.dateStr.slice(0, 4));
      if (Number.isFinite(y) && y >= 1990 && y <= 2100) years.add(y);
    }
    periodiList = [...years]
      .sort((a, b) => a - b)
      .map((y) => ({ key: y, label: String(y) }));
  } else if (mese != null) {
    periodiList = [{ key: mese, label: MESI_IT[mese - 1] }];
  } else {
    periodiList = MESI_IT.map((label, i) => ({ key: i + 1, label }));
  }

  const matrix: number[][] = periodiList.map(() =>
    aziendeSorted.map(() => 0)
  );

  for (const r of rows) {
    const ai = indexById.get(r.clienteId);
    if (ai == null) continue;
    const bucket = vita
      ? Number(r.dateStr.slice(0, 4))
      : Number(r.dateStr.slice(5, 7));
    const mi = periodiList.findIndex((x) => x.key === bucket);
    if (mi < 0) continue;
    matrix[mi][ai] += r.amount;
  }

  const mesi = periodiList.map((p, mi) => {
    const perAzienda = matrix[mi].map((v) => roundMoney(v));
    const totale = perAzienda.reduce((a, b) => a + b, 0);
    return {
      mese: p.key,
      label: p.label,
      totale: roundMoney(totale),
      perAzienda,
    };
  });

  const periodiLabels = periodiList.map((p) => p.label);

  const andamentoAziende = aziendeSorted.map((a, ai) => {
    if (!vita && mese != null) {
      const only = Array.from({ length: 12 }, () => 0);
      only[mese - 1] = roundMoney(matrix[0]?.[ai] ?? 0);
      return {
        aziendaId: a.id,
        label: a.label,
        color: a.color,
        valori: only,
      };
    }
    const valori = periodiList.map((_, mi) =>
      roundMoney(matrix[mi]?.[ai] ?? 0)
    );
    return {
      aziendaId: a.id,
      label: a.label,
      color: a.color,
      valori,
    };
  });

  // Prodotti venduti (importo righe)
  const prodottiMap = new Map<string, { label: string; valore: number }>();

  if (fonte === "fatture" || fonte === "entrambi") {
    if (fatturaIds.length > 0) {
      // batch in chunks
      const chunkSize = 200;
      for (let i = 0; i < fatturaIds.length; i += chunkSize) {
        const chunk = fatturaIds.slice(i, i + chunkSize);
        const { data: righe, error: rErr } = await supabase
          .from("fatture_emesse_righe")
          .select("codice, descrizione, importo, fattura_id")
          .in("fattura_id", chunk);
        if (rErr) {
          return { ok: false, error: `Righe fatture: ${rErr.message}` };
        }
        for (const r of righe ?? []) {
          const codice = String(r.codice ?? "").trim() || "N/D";
          if (codice.toUpperCase() === "SPED") continue;
          const desc = String(r.descrizione ?? "").trim();
          const key = codice;
          const prev = prodottiMap.get(key);
          const add = Number(r.importo) || 0;
          if (prev) prev.valore += add;
          else
            prodottiMap.set(key, {
              label: labelProdottoGrafico(codice, desc),
              valore: add,
            });
        }
      }
    }
  }

  if (fonte === "ordini" || (fonte === "entrambi" && fatturaIds.length === 0)) {
    let ordiniQ = supabase
      .from("ordini")
      .select("id")
      .is("deleted_at", null)
      .eq("pagato", true);
    ordiniQ = applyDateRange(ordiniQ, "data_ordine", range, floor);
    ordiniQ = applyClienteIds(ordiniQ, aziende.ids);
    const { data: ordini, error: oErr } = await ordiniQ;
    if (oErr) {
      return { ok: false, error: `Ordini prodotti: ${oErr.message}` };
    }
    const oids = (ordini ?? []).map((o) => o.id as string);
    if (oids.length > 0) {
      const { data: righe, error: rErr } = await supabase
        .from("ordini_righe")
        .select("prodotto_codice, prodotto_nome, quantita, prezzo_unitario")
        .in("ordine_id", oids);
      if (rErr) {
        return { ok: false, error: `Righe ordini prodotti: ${rErr.message}` };
      }
      for (const r of righe ?? []) {
        const codice = String(r.prodotto_codice ?? "").trim() || "N/D";
        const nome = String(r.prodotto_nome ?? "").trim();
        const add =
          (Number(r.quantita) || 0) * (Number(r.prezzo_unitario) || 0);
        const prev = prodottiMap.get(codice);
        if (prev) prev.valore += add;
        else
          prodottiMap.set(codice, {
            label: labelProdottoGrafico(codice, nome),
            valore: add,
          });
      }
    }
  }

  const prodottiSorted = [...prodottiMap.entries()]
    .sort((a, b) => b[1].valore - a[1].valore)
    .slice(0, 12)
    .map(([codice, meta], index) => ({
      codice,
      label: meta.label,
      valore: roundMoney(meta.valore),
      color: coloreAziendaByIndex(index),
    }));

  const totale = mesi.reduce((a, m) => a + m.totale, 0);

  return {
    ok: true,
    data: {
      anno,
      granularita,
      totale: roundMoney(totale),
      aziende: aziendeSorted,
      mesi,
      andamentoAziende,
      periodiLabels:
        !vita && mese != null
          ? MESI_IT.map((l) => l)
          : periodiLabels,
      prodotti: prodottiSorted,
    },
  };
}

async function loadOrdiniQtyAnno(
  supabase: Awaited<ReturnType<typeof createClient>>,
  anno: number,
  mese: number | null | undefined,
  prodottoId: string | null | undefined,
  clienteId: string | null | undefined
): Promise<{ ok: true; data: GraficiKpi } | { ok: false; error: string }> {
  const range = dateRangeForYear(anno);
  const floor = await resolveStatsDateFloor();
  const aziende = await resolveStatsClienteIds(supabase, clienteId);
  if (aziende.empty) {
    return { ok: true, data: emptyKpi(anno) };
  }

  let ordiniQ = supabase
    .from("ordini")
    .select("id, data_ordine, cliente_id")
    .is("deleted_at", null);
  ordiniQ = applyDateRange(ordiniQ, "data_ordine", range, floor);
  ordiniQ = applyClienteIds(ordiniQ, aziende.ids);

  const { data: ordini, error: ordiniErr } = await ordiniQ;
  if (ordiniErr) {
    return { ok: false, error: `Ordini: ${ordiniErr.message}` };
  }
  if (!ordini?.length) {
    return { ok: true, data: accumulateByMonth(anno, [], mese) };
  }

  const ordineById = new Map(
    ordini.map((o) => [o.id as string, String(o.data_ordine ?? "")])
  );
  const ids = [...ordineById.keys()];

  let righeQ = supabase
    .from("ordini_righe")
    .select("ordine_id, prodotto_id, quantita")
    .in("ordine_id", ids);
  if (prodottoId) righeQ = righeQ.eq("prodotto_id", prodottoId);

  const { data: righe, error: righeErr } = await righeQ;
  if (righeErr) {
    return { ok: false, error: `Righe ordini: ${righeErr.message}` };
  }

  const rows = (righe ?? []).map((r) => ({
    dateStr: ordineById.get(r.ordine_id as string) ?? "",
    amount: Number(r.quantita) || 0,
  }));

  return { ok: true, data: accumulatePeriodo(anno, rows, mese) };
}

export async function getGraficiIncassiAction(
  input: GraficiIncassiFiltro
): Promise<ActionOk<{ data: GraficiKpi }> | ActionFail> {
  const parsed = graficiIncassiFiltroSchema.safeParse(input);
  if (!parsed.success) {
    return { success: false, error: "Filtri non validi." };
  }
  const { anno, mese, clienteId, fonte = "fatture" } = parsed.data;
  const supabase = await createClient();
  const result = await loadIncassiAnno(
    supabase,
    anno,
    mese,
    clienteId,
    fonte
  );
  if (!result.ok) return { success: false, error: result.error };
  return { success: true, data: result.data };
}

export async function getGraficiIncassiDettaglioAction(
  input: GraficiIncassiFiltro
): Promise<ActionOk<{ data: GraficiIncassiDettaglio }> | ActionFail> {
  const parsed = graficiIncassiFiltroSchema.safeParse(input);
  if (!parsed.success) {
    return { success: false, error: "Filtri non validi." };
  }
  const { anno, mese, clienteId, fonte = "fatture" } = parsed.data;
  const supabase = await createClient();
  const result = await loadIncassiDettaglioAnno(
    supabase,
    anno,
    mese,
    clienteId,
    fonte
  );
  if (!result.ok) return { success: false, error: result.error };
  return { success: true, data: result.data };
}

export async function getGraficiIncassiMultiAnnoAction(
  input: GraficiIncassiFiltro
): Promise<ActionOk<{ data: GraficiMultiAnno }> | ActionFail> {
  const parsed = graficiIncassiFiltroSchema.safeParse(input);
  if (!parsed.success) {
    return { success: false, error: "Filtri non validi." };
  }
  const {
    anno,
    mese,
    clienteId,
    fonte = "fatture",
    anniConfronto,
  } = parsed.data;
  if (isInteraVita(anno)) {
    return {
      success: false,
      error: "Il confronto multi-anno non è disponibile con «Intera vita».",
    };
  }
  const anni = [
    ...new Set(
      (anniConfronto?.length ? anniConfronto : [anno]).filter(
        (y) => typeof y === "number" && !isInteraVita(y)
      )
    ),
  ].sort((a, b) => a - b);
  if (anni.length === 0) {
    return { success: false, error: "Seleziona almeno un anno." };
  }
  if (anni.length > 6) {
    return { success: false, error: "Massimo 6 anni a confronto." };
  }

  const supabase = await createClient();
  const seriePerAnno: GraficiKpi[] = [];
  for (const y of anni) {
    const result = await loadIncassiAnno(
      supabase,
      y,
      mese,
      clienteId,
      fonte
    );
    if (!result.ok) return { success: false, error: result.error };
    seriePerAnno.push(result.data);
  }

  const and = calcolaAndamentoMultiAnno(seriePerAnno);
  return {
    success: true,
    data: {
      seriePerAnno,
      ...and,
    },
  };
}

export async function getGraficiOrdiniQtyAction(
  input: GraficiOrdiniFiltro
): Promise<ActionOk<{ data: GraficiKpi }> | ActionFail> {
  const parsed = graficiOrdiniFiltroSchema.safeParse(input);
  if (!parsed.success) {
    return { success: false, error: "Filtri non validi." };
  }
  const { anno, mese, prodottoId, clienteId } = parsed.data;
  const supabase = await createClient();
  const result = await loadOrdiniQtyAnno(
    supabase,
    anno,
    mese,
    prodottoId,
    clienteId
  );
  if (!result.ok) return { success: false, error: result.error };
  return { success: true, data: result.data };
}

export async function getGraficiOrdiniQtyMultiAnnoAction(
  input: GraficiOrdiniFiltro
): Promise<ActionOk<{ data: GraficiMultiAnno }> | ActionFail> {
  const parsed = graficiOrdiniFiltroSchema.safeParse(input);
  if (!parsed.success) {
    return { success: false, error: "Filtri non validi." };
  }
  const { anno, mese, prodottoId, clienteId, anniConfronto } = parsed.data;
  if (isInteraVita(anno)) {
    return {
      success: false,
      error: "Il confronto multi-anno non è disponibile con «Intera vita».",
    };
  }
  const anni = [
    ...new Set(
      (anniConfronto?.length ? anniConfronto : [anno]).filter(
        (y) => typeof y === "number" && !isInteraVita(y)
      )
    ),
  ].sort((a, b) => a - b);
  if (anni.length === 0) {
    return { success: false, error: "Seleziona almeno un anno." };
  }
  if (anni.length > 6) {
    return { success: false, error: "Massimo 6 anni a confronto." };
  }

  const supabase = await createClient();
  const seriePerAnno: GraficiKpi[] = [];
  for (const y of anni) {
    const result = await loadOrdiniQtyAnno(
      supabase,
      y,
      mese,
      prodottoId,
      clienteId
    );
    if (!result.ok) return { success: false, error: result.error };
    seriePerAnno.push(result.data);
  }
  const and = calcolaAndamentoMultiAnno(seriePerAnno);
  return {
    success: true,
    data: {
      seriePerAnno,
      ...and,
    },
  };
}

export async function getGraficiHomeAnnoAction(
  input: { anno: number; mese?: number | null; clienteId?: string | null }
): Promise<
  | ActionOk<{ ordini: GraficiKpi; incassi: GraficiKpi }>
  | ActionFail
> {
  const parsed = graficiPeriodoSchema
    .extend({
      clienteId: graficiIncassiFiltroSchema.shape.clienteId,
    })
    .safeParse(input);
  if (!parsed.success) {
    return { success: false, error: "Periodo non valido." };
  }
  const { anno, mese, clienteId } = parsed.data;
  const supabase = await createClient();

  const [ordiniR, incassiR] = await Promise.all([
    loadOrdiniQtyAnno(supabase, anno, mese, null, clienteId),
    loadIncassiAnno(supabase, anno, mese, clienteId, "fatture"),
  ]);

  if (!ordiniR.ok) return { success: false, error: ordiniR.error };
  if (!incassiR.ok) return { success: false, error: incassiR.error };

  return {
    success: true,
    ordini: ordiniR.data,
    incassi: incassiR.data,
  };
}

function emptyProvvigioniDettaglio(anno: number): GraficiProvvigioniDettaglio {
  const base = emptyDettaglio(anno);
  return {
    ...base,
    totaleProvvigione: 0,
    mesiProvvigione: [],
    andamentoProvvigioni: [],
    percentualePerAzienda: {},
  };
}

async function loadPctByCommerciale(
  commercialeIds: string[]
): Promise<Map<string, number | null>> {
  const map = new Map<string, number | null>();
  const ids = [...new Set(commercialeIds.filter(Boolean))];
  if (ids.length === 0) return map;
  const service = createServiceClient();
  const [{ data: profiles }, { data: persone }] = await Promise.all([
    service
      .from("profiles")
      .select("id, commerciale_provvigione_pct")
      .in("id", ids),
    service
      .from("organigramma_persone")
      .select("user_id, commerciale_provvigione_pct")
      .in("user_id", ids)
      .is("deleted_at", null),
  ]);
  for (const p of persone ?? []) {
    const uid = String((p as { user_id?: string }).user_id ?? "");
    const parsed = parseProvvigionePctInput(
      (p as { commerciale_provvigione_pct?: number | null })
        .commerciale_provvigione_pct
    );
    if (uid) map.set(uid, parsed.ok ? parsed.value : null);
  }
  for (const p of profiles ?? []) {
    const id = String((p as { id: string }).id);
    if (map.has(id) && map.get(id) != null) continue;
    const parsed = parseProvvigionePctInput(
      (p as { commerciale_provvigione_pct?: number | null })
        .commerciale_provvigione_pct
    );
    map.set(id, parsed.ok ? parsed.value : null);
  }
  return map;
}

async function resolveProvvigioniClienti(opts: {
  supabase: Awaited<ReturnType<typeof createClient>>;
  clienteId?: string | null;
  commercialeId?: string | null;
}): Promise<
  | {
      empty: boolean;
      ids: string[];
      pctByCliente: Record<string, number | null>;
    }
> {
  const stats = await resolveStatsClienteIds(opts.supabase, opts.clienteId);
  if (stats.empty) {
    return { empty: true, ids: [], pctByCliente: {} };
  }
  const auth = await getAuthContext();
  if (!auth) return { empty: true, ids: [], pctByCliente: {} };
  const skip = isSuperadminProfile(auth.profile) && !auth.impersonating;
  const filterComm = opts.commercialeId?.trim() || null;
  let commercialIds: string[] | null = null;
  if (filterComm) {
    if (!skip) {
      const lineage = await loadCommercialLineageUserIds(auth.userId);
      if (!lineage.includes(filterComm)) {
        return { empty: true, ids: [], pctByCliente: {} };
      }
    }
    commercialIds = [filterComm];
  } else if (!skip) {
    commercialIds = await loadCommercialLineageUserIds(auth.userId);
  }

  let q = opts.supabase
    .from("clienti")
    .select("id, commerciale_id")
    .is("deleted_at", null)
    .not("commerciale_id", "is", null);
  if (commercialIds && commercialIds.length > 0) {
    q = q.in("commerciale_id", commercialIds);
  }
  if (stats.ids) q = q.in("id", stats.ids);
  const { data, error } = await q;
  if (error || !data) {
    return { empty: true, ids: [], pctByCliente: {} };
  }

  const commIds = data
    .map((r) => String((r as { commerciale_id?: string }).commerciale_id ?? ""))
    .filter(Boolean);
  const pctByComm = await loadPctByCommerciale(commIds);
  const pctByCliente: Record<string, number | null> = {};
  const ids: string[] = [];
  for (const r of data) {
    const id = String((r as { id: string }).id);
    const cid = String((r as { commerciale_id?: string }).commerciale_id ?? "");
    ids.push(id);
    pctByCliente[id] = cid ? (pctByComm.get(cid) ?? null) : null;
  }
  return { empty: ids.length === 0, ids, pctByCliente };
}

async function loadProvvigioniDettaglioAnno(
  supabase: Awaited<ReturnType<typeof createClient>>,
  anno: number,
  mese: number | null | undefined,
  clienteId: string | null | undefined,
  commercialeId: string | null | undefined
): Promise<
  | { ok: true; data: GraficiProvvigioniDettaglio }
  | { ok: false; error: string }
> {
  const range = dateRangeForYear(anno);
  const floor = await resolveStatsDateFloor();
  const aziende = await resolveProvvigioniClienti({
    supabase,
    clienteId,
    commercialeId,
  });
  if (aziende.empty) {
    return { ok: true, data: emptyProvvigioniDettaglio(anno) };
  }

  type Row = {
    dateStr: string;
    amount: number;
    provvigione: number;
    clienteId: string;
    clienteLabel: string;
    codiceTarga: string;
  };
  const rows: Row[] = [];
  const fatturaIds: string[] = [];

  let q = supabase
    .from("fatture_emesse")
    .select(
      "id, data_emissione, totale, cliente_id, cliente_ragione_sociale, cliente_codice_targa, tipo_documento, stato_pagamento, fattura_collegata_id"
    )
    .is("deleted_at", null);
  q = applyDateRange(q, "data_emissione", range, floor);
  q = applyClienteIds(q, aziende.ids);
  const { data, error } = await q;
  if (error) {
    return { ok: false, error: `Provvigioni da fatture: ${error.message}` };
  }
  for (const r of data ?? []) {
    if (!includeInContabilitaFatturaEmessa(r)) continue;
    const cid = String(r.cliente_id ?? "");
    if (!cid) continue;
    const dateStr = String(r.data_emissione ?? "");
    const m = Number(dateStr.slice(5, 7));
    if (mese != null && m !== mese) continue;
    const isNc = r.tipo_documento === "nota_credito";
    let amount = Number(r.totale) || 0;
    if (isNc) amount = amount <= 0 ? amount : -Math.abs(amount);
    rows.push({
      dateStr,
      amount,
      provvigione: calcolaProvvigione(amount, aziende.pctByCliente[cid]),
      clienteId: cid,
      clienteLabel: String(r.cliente_ragione_sociale ?? "Cliente"),
      codiceTarga: String(r.cliente_codice_targa ?? ""),
    });
    if (r.id && !isNc) fatturaIds.push(String(r.id));
  }

  const aziendaMap = new Map<
    string,
    { label: string; codiceTarga: string; totale: number }
  >();
  for (const r of rows) {
    const prev = aziendaMap.get(r.clienteId);
    if (prev) prev.totale += r.amount;
    else {
      aziendaMap.set(r.clienteId, {
        label: r.clienteLabel,
        codiceTarga: r.codiceTarga,
        totale: r.amount,
      });
    }
  }

  const aziendeSorted = [...aziendaMap.entries()]
    .sort((a, b) => b[1].totale - a[1].totale)
    .map(([id, meta], index) => ({
      id,
      label: meta.codiceTarga
        ? `${meta.codiceTarga} — ${meta.label}`
        : meta.label,
      codiceTarga: meta.codiceTarga,
      color: coloreAziendaByIndex(index),
    }));

  const indexById = new Map(aziendeSorted.map((a, i) => [a.id, i]));
  const vita = isInteraVita(anno);
  const granularita = vita ? ("anno" as const) : ("mese" as const);

  let periodiList: { key: number; label: string }[];
  if (vita) {
    const years = new Set<number>();
    for (const r of rows) {
      const y = Number(r.dateStr.slice(0, 4));
      if (Number.isFinite(y) && y >= 1990 && y <= 2100) years.add(y);
    }
    periodiList = [...years]
      .sort((a, b) => a - b)
      .map((y) => ({ key: y, label: String(y) }));
  } else if (mese != null) {
    periodiList = [{ key: mese, label: MESI_IT[mese - 1] }];
  } else {
    periodiList = MESI_IT.map((label, i) => ({ key: i + 1, label }));
  }

  const matrixInc: number[][] = periodiList.map(() =>
    aziendeSorted.map(() => 0)
  );
  const matrixProv: number[][] = periodiList.map(() =>
    aziendeSorted.map(() => 0)
  );

  for (const r of rows) {
    const ai = indexById.get(r.clienteId);
    if (ai == null) continue;
    const bucket = vita
      ? Number(r.dateStr.slice(0, 4))
      : Number(r.dateStr.slice(5, 7));
    const mi = periodiList.findIndex((x) => x.key === bucket);
    if (mi < 0) continue;
    matrixInc[mi][ai] += r.amount;
    matrixProv[mi][ai] += r.provvigione;
  }

  const mesi = periodiList.map((p, mi) => {
    const perAzienda = matrixInc[mi].map((v) => roundMoney(v));
    return {
      mese: p.key,
      label: p.label,
      totale: roundMoney(perAzienda.reduce((a, b) => a + b, 0)),
      perAzienda,
    };
  });
  const mesiProvvigione = periodiList.map((p, mi) => {
    const perAzienda = matrixProv[mi].map((v) => roundMoney(v));
    return {
      mese: p.key,
      label: p.label,
      totale: roundMoney(perAzienda.reduce((a, b) => a + b, 0)),
      perAzienda,
    };
  });

  const periodiLabels = periodiList.map((p) => p.label);
  const mapAndamento = (matrix: number[][]) =>
    aziendeSorted.map((a, ai) => {
      if (!vita && mese != null) {
        const only = Array.from({ length: 12 }, () => 0);
        only[mese - 1] = roundMoney(matrix[0]?.[ai] ?? 0);
        return {
          aziendaId: a.id,
          label: a.label,
          color: a.color,
          valori: only,
        };
      }
      return {
        aziendaId: a.id,
        label: a.label,
        color: a.color,
        valori: periodiList.map((_, mi) => roundMoney(matrix[mi]?.[ai] ?? 0)),
      };
    });

  const prodottiMap = new Map<string, { label: string; valore: number }>();
  if (fatturaIds.length > 0) {
    const chunkSize = 200;
    for (let i = 0; i < fatturaIds.length; i += chunkSize) {
      const chunk = fatturaIds.slice(i, i + chunkSize);
      const { data: righe } = await supabase
        .from("fatture_emesse_righe")
        .select("codice, descrizione, importo")
        .in("fattura_id", chunk);
      for (const riga of righe ?? []) {
        const codice = String(riga.codice ?? "").trim() || "N/D";
        const label = labelProdottoGrafico(
          codice,
          String(riga.descrizione ?? "")
        );
        const prev = prodottiMap.get(codice);
        const val = Number(riga.importo) || 0;
        if (prev) prev.valore += val;
        else prodottiMap.set(codice, { label, valore: val });
      }
    }
  }
  const prodotti = [...prodottiMap.entries()]
    .sort((a, b) => b[1].valore - a[1].valore)
    .slice(0, 12)
    .map(([, meta], i) => ({
      codice: meta.label,
      label: meta.label,
      valore: roundMoney(meta.valore),
      color: coloreAziendaByIndex(i),
    }));

  const percentualePerAzienda: Record<string, number | null> = {};
  for (const a of aziendeSorted) {
    percentualePerAzienda[a.id] = aziende.pctByCliente[a.id] ?? null;
  }

  return {
    ok: true,
    data: {
      anno,
      granularita,
      totale: roundMoney(mesi.reduce((a, m) => a + m.totale, 0)),
      totaleProvvigione: roundMoney(
        mesiProvvigione.reduce((a, m) => a + m.totale, 0)
      ),
      aziende: aziendeSorted,
      mesi,
      mesiProvvigione,
      andamentoAziende: mapAndamento(matrixInc),
      andamentoProvvigioni: mapAndamento(matrixProv),
      periodiLabels,
      prodotti,
      percentualePerAzienda,
    },
  };
}

async function loadProvvigioniAnno(
  supabase: Awaited<ReturnType<typeof createClient>>,
  anno: number,
  mese: number | null | undefined,
  clienteId: string | null | undefined,
  commercialeId: string | null | undefined,
  kind: "incasso" | "provvigione"
): Promise<{ ok: true; data: GraficiKpi } | { ok: false; error: string }> {
  const det = await loadProvvigioniDettaglioAnno(
    supabase,
    anno,
    mese,
    clienteId,
    commercialeId
  );
  if (!det.ok) return det;
  const mesi = kind === "incasso" ? det.data.mesi : det.data.mesiProvvigione;
  if (isInteraVita(anno)) {
    return {
      ok: true,
      data: {
        anno,
        totale: kind === "incasso" ? det.data.totale : det.data.totaleProvvigione,
        serie: mesi.map((m) => ({
          mese: m.mese,
          label: m.label,
          valore: m.totale,
        })),
      },
    };
  }
  const base = emptySerieAnno(anno);
  for (const m of mesi) {
    const idx = base.serie.findIndex((s) => s.mese === m.mese);
    if (idx >= 0) base.serie[idx].valore = m.totale;
  }
  if (mese != null) {
    base.serie = base.serie.filter((s) => s.mese === mese);
  }
  base.totale = base.serie.reduce((a, s) => a + s.valore, 0);
  return { ok: true, data: base };
}

export async function getGraficiProvvigioniDettaglioAction(
  input: GraficiProvvigioniFiltro
): Promise<ActionOk<{ data: GraficiProvvigioniDettaglio }> | ActionFail> {
  const parsed = graficiProvvigioniFiltroSchema.safeParse(input);
  if (!parsed.success) {
    return { success: false, error: "Filtri non validi." };
  }
  const { anno, mese, clienteId, commercialeId } = parsed.data;
  const supabase = await createClient();
  const result = await loadProvvigioniDettaglioAnno(
    supabase,
    anno,
    mese,
    clienteId,
    commercialeId
  );
  if (!result.ok) return { success: false, error: result.error };
  return { success: true, data: result.data };
}

export async function getGraficiProvvigioniMultiAnnoAction(
  input: GraficiProvvigioniFiltro
): Promise<
  | ActionOk<{
      data: {
        incassi: GraficiMultiAnno;
        provvigioni: GraficiMultiAnno;
      };
    }>
  | ActionFail
> {
  const parsed = graficiProvvigioniFiltroSchema.safeParse(input);
  if (!parsed.success) {
    return { success: false, error: "Filtri non validi." };
  }
  const { anno, mese, clienteId, commercialeId, anniConfronto } = parsed.data;
  if (isInteraVita(anno)) {
    return {
      success: false,
      error: "Il confronto multi-anno non è disponibile con «Intera vita».",
    };
  }
  const anni = [
    ...new Set(
      (anniConfronto?.length ? anniConfronto : [anno]).filter(
        (y) => typeof y === "number" && !isInteraVita(y)
      )
    ),
  ].sort((a, b) => a - b);
  if (anni.length === 0) return { success: false, error: "Seleziona almeno un anno." };
  if (anni.length > 6) {
    return { success: false, error: "Massimo 6 anni a confronto." };
  }
  const supabase = await createClient();
  const serieInc: GraficiKpi[] = [];
  const serieProv: GraficiKpi[] = [];
  for (const y of anni) {
    const inc = await loadProvvigioniAnno(
      supabase,
      y,
      mese,
      clienteId,
      commercialeId,
      "incasso"
    );
    if (!inc.ok) return { success: false, error: inc.error };
    const prov = await loadProvvigioniAnno(
      supabase,
      y,
      mese,
      clienteId,
      commercialeId,
      "provvigione"
    );
    if (!prov.ok) return { success: false, error: prov.error };
    serieInc.push(inc.data);
    serieProv.push(prov.data);
  }
  return {
    success: true,
    data: {
      incassi: { seriePerAnno: serieInc, ...calcolaAndamentoMultiAnno(serieInc) },
      provvigioni: {
        seriePerAnno: serieProv,
        ...calcolaAndamentoMultiAnno(serieProv),
      },
    },
  };
}

export async function listCommercialiProvvigioniFiltroAction(): Promise<
  | {
      success: true;
      canFilter: boolean;
      commerciali: Array<{ id: string; nome: string; percentuale: number | null }>;
    }
  | { success: false; error: string }
> {
  const auth = await getAuthContext();
  if (!auth) return { success: false, error: "Non autenticato." };
  const canFilter = isSuperadminProfile(auth.profile) && !auth.impersonating;
  if (!canFilter) {
    return { success: true, canFilter: false, commerciali: [] };
  }
  const service = createServiceClient();
  const { data } = await service
    .from("organigramma_persone")
    .select("user_id, nome, cognome, commerciale_provvigione_pct")
    .is("deleted_at", null)
    .not("user_id", "is", null)
    .not("commerciale_grado", "is", null);
  const commerciali = (data ?? [])
    .map((r) => {
      const parsed = parseProvvigionePctInput(
        (r as { commerciale_provvigione_pct?: number | null })
          .commerciale_provvigione_pct
      );
      return {
        id: String((r as { user_id: string }).user_id),
        nome: `${(r as { cognome?: string }).cognome ?? ""} ${(r as { nome?: string }).nome ?? ""}`.trim() || "Commerciale",
        percentuale: parsed.ok ? parsed.value : null,
      };
    })
    .sort((a, b) => a.nome.localeCompare(b.nome, "it"));
  return { success: true, canFilter, commerciali };
}
