"use server";

import { createClient } from "@/lib/supabase/server";
import {
  calcolaAndamentoMultiAnno,
  coloreAziendaByIndex,
  emptySerieAnno,
  graficiIncassiFiltroSchema,
  graficiOrdiniFiltroSchema,
  graficiPeriodoSchema,
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

function dateRangeForYear(anno: number): { from: string; to: string } {
  return {
    from: `${anno}-01-01`,
    to: `${anno}-12-31`,
  };
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

async function loadIncassiAnno(
  supabase: Awaited<ReturnType<typeof createClient>>,
  anno: number,
  mese: number | null | undefined,
  clienteId: string | null | undefined,
  fonte: GraficiFonteIncassi
): Promise<{ ok: true; data: GraficiKpi } | { ok: false; error: string }> {
  const { from, to } = dateRangeForYear(anno);
  const rows: { dateStr: string; amount: number }[] = [];

  if (fonte === "fatture" || fonte === "entrambi") {
    let q = supabase
      .from("fatture_emesse")
      .select("data_emissione, totale, cliente_id")
      .is("deleted_at", null)
      .gte("data_emissione", from)
      .lte("data_emissione", to);
    if (clienteId) q = q.eq("cliente_id", clienteId);
    const { data, error } = await q;
    if (error) {
      return {
        ok: false,
        error: `Incassi da fatture: ${error.message}`,
      };
    }
    for (const r of data ?? []) {
      rows.push({
        dateStr: String(r.data_emissione ?? ""),
        amount: Number(r.totale) || 0,
      });
    }
  }

  if (fonte === "ordini" || fonte === "entrambi") {
    let q = supabase
      .from("ordini")
      .select("data_ordine, importo_euro, cliente_id, pagato")
      .is("deleted_at", null)
      .eq("pagato", true)
      .gte("data_ordine", from)
      .lte("data_ordine", to);
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

  return { ok: true, data: accumulateByMonth(anno, rows, mese) };
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
  const { from, to } = dateRangeForYear(anno);
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
        "id, data_emissione, totale, cliente_id, cliente_ragione_sociale, cliente_codice_targa"
      )
      .is("deleted_at", null)
      .gte("data_emissione", from)
      .lte("data_emissione", to);
    if (clienteId) q = q.eq("cliente_id", clienteId);
    const { data, error } = await q;
    if (error) {
      return { ok: false, error: `Incassi da fatture: ${error.message}` };
    }
    for (const r of data ?? []) {
      const cid = String(r.cliente_id ?? "");
      if (!cid) continue;
      const dateStr = String(r.data_emissione ?? "");
      const m = Number(dateStr.slice(5, 7));
      if (mese != null && m !== mese) continue;
      rows.push({
        dateStr,
        amount: Number(r.totale) || 0,
        clienteId: cid,
        clienteLabel: String(r.cliente_ragione_sociale ?? "Cliente"),
        codiceTarga: String(r.cliente_codice_targa ?? ""),
      });
      if (r.id) fatturaIds.push(String(r.id));
    }
  }

  if (fonte === "ordini" || fonte === "entrambi") {
    let q = supabase
      .from("ordini")
      .select(
        "id, data_ordine, importo_euro, cliente_id, clienti(ragione_sociale, codice_targa)"
      )
      .is("deleted_at", null)
      .eq("pagato", true)
      .gte("data_ordine", from)
      .lte("data_ordine", to);
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
  const mesiList =
    mese != null
      ? [{ mese, label: MESI_IT[mese - 1] }]
      : MESI_IT.map((label, i) => ({ mese: i + 1, label }));

  const matrix: number[][] = mesiList.map(() =>
    aziendeSorted.map(() => 0)
  );

  for (const r of rows) {
    const ai = indexById.get(r.clienteId);
    if (ai == null) continue;
    const m = Number(r.dateStr.slice(5, 7));
    const mi = mesiList.findIndex((x) => x.mese === m);
    if (mi < 0) continue;
    matrix[mi][ai] += r.amount;
  }

  const mesi = mesiList.map((m, mi) => {
    const perAzienda = matrix[mi].map((v) =>
      Math.round((v + Number.EPSILON) * 100) / 100
    );
    const totale = perAzienda.reduce((a, b) => a + b, 0);
    return {
      mese: m.mese,
      label: m.label,
      totale: Math.round((totale + Number.EPSILON) * 100) / 100,
      perAzienda,
    };
  });

  const andamentoAziende = aziendeSorted.map((a, ai) => {
    const valori = Array.from({ length: 12 }, (_, i) => {
      if (mese != null && i + 1 !== mese) {
        // In filtro mese: solo quel mese ha valore, gli altri 0 per la linea annualizzata
        return 0;
      }
      const mi = mesiList.findIndex((x) => x.mese === i + 1);
      if (mi < 0) return 0;
      return matrix[mi][ai] ?? 0;
    });
    // Se filtro mese singolo, costruisci serie a 12 mesi con solo quel mese valorizzato
    if (mese != null) {
      const only = Array.from({ length: 12 }, () => 0);
      only[mese - 1] = matrix[0]?.[ai] ?? 0;
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
      valori: valori.map((v) => Math.round((v + Number.EPSILON) * 100) / 100),
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
              label: desc ? `${codice} — ${desc}` : codice,
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
      .eq("pagato", true)
      .gte("data_ordine", from)
      .lte("data_ordine", to);
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
            label: nome ? `${codice} — ${nome}` : codice,
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
      valore: Math.round((meta.valore + Number.EPSILON) * 100) / 100,
      color: coloreAziendaByIndex(index),
    }));

  const totale = mesi.reduce((a, m) => a + m.totale, 0);

  return {
    ok: true,
    data: {
      anno,
      totale: Math.round((totale + Number.EPSILON) * 100) / 100,
      aziende: aziendeSorted,
      mesi,
      andamentoAziende,
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
  const { from, to } = dateRangeForYear(anno);

  let ordiniQ = supabase
    .from("ordini")
    .select("id, data_ordine, cliente_id")
    .is("deleted_at", null)
    .gte("data_ordine", from)
    .lte("data_ordine", to);
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

  return { ok: true, data: accumulateByMonth(anno, rows, mese) };
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
  const anni = [
    ...new Set(
      (anniConfronto?.length ? anniConfronto : [anno]).filter(Boolean)
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
  const anni = [
    ...new Set(
      (anniConfronto?.length ? anniConfronto : [anno]).filter(Boolean)
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
