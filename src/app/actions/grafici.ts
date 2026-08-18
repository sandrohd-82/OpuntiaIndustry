"use server";

import { createClient } from "@/lib/supabase/server";
import { includeInContabilitaFatturaEmessa } from "@/lib/amministrazione/fatture";
import {
  calcolaAndamentoMultiAnno,
  coloreAziendaByIndex,
  emptySerieAnno,
  emptySerieInteraVita,
  graficiIncassiFiltroSchema,
  graficiOrdiniFiltroSchema,
  graficiPeriodoSchema,
  isInteraVita,
  labelProdottoGrafico,
  MESI_IT,
  type GraficiFonteIncassi,
  type GraficiIncassiDettaglio,
  type GraficiIncassiFiltro,
  type GraficiKpi,
  type GraficiMultiAnno,
  type GraficiOrdiniFiltro,
} from "@/lib/amministrazione/grafici";

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
function applyDateRange<T extends DateFilterQuery>(
  query: T,
  column: string,
  range: { from: string; to: string } | null
): T {
  if (!range) return query;
  return query.gte(column, range.from).lte(column, range.to) as T;
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
  const rows: { dateStr: string; amount: number }[] = [];

  if (fonte === "fatture" || fonte === "entrambi") {
    let q = supabase
      .from("fatture_emesse")
      .select(
        "data_emissione, totale, cliente_id, tipo_documento, stato_pagamento, fattura_collegata_id, spedizione, spedizione_iva_applicata, spedizione_sottrai_incassi, iva_percentuale"
      )
      .is("deleted_at", null);
    q = applyDateRange(q, "data_emissione", range);
    if (clienteId) q = q.eq("cliente_id", clienteId);
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
    q = applyDateRange(q, "data_ordine", range);
    if (clienteId) q = q.eq("cliente_id", clienteId);
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
    q = applyDateRange(q, "data_emissione", range);
    if (clienteId) q = q.eq("cliente_id", clienteId);
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
    q = applyDateRange(q, "data_ordine", range);
    if (clienteId) q = q.eq("cliente_id", clienteId);
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
    ordiniQ = applyDateRange(ordiniQ, "data_ordine", range);
    if (clienteId) ordiniQ = ordiniQ.eq("cliente_id", clienteId);
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

  let ordiniQ = supabase
    .from("ordini")
    .select("id, data_ordine, cliente_id")
    .is("deleted_at", null);
  ordiniQ = applyDateRange(ordiniQ, "data_ordine", range);
  if (clienteId) ordiniQ = ordiniQ.eq("cliente_id", clienteId);

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
