"use server";

import { createClient } from "@/lib/supabase/server";
import {
  calcolaAndamentoMultiAnno,
  emptySerieAnno,
  graficiIncassiFiltroSchema,
  graficiOrdiniFiltroSchema,
  graficiPeriodoSchema,
  type GraficiFonteIncassi,
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
