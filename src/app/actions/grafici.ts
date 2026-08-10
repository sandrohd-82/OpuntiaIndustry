"use server";

import { createClient } from "@/lib/supabase/server";
import {
  emptySerieAnno,
  graficiIncassiFiltroSchema,
  graficiOrdiniFiltroSchema,
  type GraficiIncassiFiltro,
  type GraficiKpi,
  type GraficiOrdiniFiltro,
} from "@/lib/amministrazione/grafici";
import { requireAreaAccess } from "@/lib/areas/guard";

function yearBounds(anno: number): { from: string; to: string } {
  return {
    from: `${anno}-01-01`,
    to: `${anno}-12-31`,
  };
}

function meseRange(
  anno: number,
  mese: number
): { from: string; toExclusive: string } {
  const mm = String(mese).padStart(2, "0");
  const from = `${anno}-${mm}-01`;
  const next =
    mese === 12 ? { y: anno + 1, m: 1 } : { y: anno, m: mese + 1 };
  return {
    from,
    toExclusive: `${next.y}-${String(next.m).padStart(2, "0")}-01`,
  };
}

function accumulateByMonth(
  anno: number,
  rows: Array<{ month: number; value: number }>
): GraficiKpi {
  const kpi = emptySerieAnno(anno);
  for (const row of rows) {
    if (row.month < 1 || row.month > 12) continue;
    kpi.serie[row.month - 1].valore += row.value;
  }
  kpi.totale = kpi.serie.reduce((s, m) => s + m.valore, 0);
  if (rows.length === 0) return kpi;
  return kpi;
}

export async function getGraficiOrdiniQtyAction(
  input: GraficiOrdiniFiltro
): Promise<{ success: true; data: GraficiKpi } | { success: false; error: string }> {
  await requireAreaAccess("amministrazione");
  const parsed = graficiOrdiniFiltroSchema.safeParse(input);
  if (!parsed.success) {
    return {
      success: false,
      error: parsed.error.issues[0]?.message ?? "Filtri non validi.",
    };
  }
  const { anno, mese, prodottoId } = parsed.data;
  const { from, to } = yearBounds(anno);
  const supabase = await createClient();

  let query = supabase
    .from("ordini")
    .select(
      "id, data_ordine, deleted_at, ordini_righe(quantita, prodotto_id)"
    )
    .is("deleted_at", null)
    .gte("data_ordine", from)
    .lte("data_ordine", to);

  if (mese) {
    const range = meseRange(anno, mese);
    query = query
      .gte("data_ordine", range.from)
      .lt("data_ordine", range.toExclusive);
  }

  const { data, error } = await query;
  if (error) return { success: false, error: error.message };

  const points: Array<{ month: number; value: number }> = [];
  for (const ordine of data ?? []) {
    const dataOrdine = String(
      (ordine as { data_ordine?: string }).data_ordine ?? ""
    );
    const month = Number(dataOrdine.slice(5, 7));
    const righe =
      (
        ordine as {
          ordini_righe?: Array<{ quantita: number; prodotto_id: string | null }>;
        }
      ).ordini_righe ?? [];
    for (const r of righe) {
      if (prodottoId && r.prodotto_id !== prodottoId) continue;
      points.push({ month, value: Number(r.quantita) || 0 });
    }
  }

  return { success: true, data: accumulateByMonth(anno, points) };
}

export async function getGraficiIncassiAction(
  input: GraficiIncassiFiltro
): Promise<{ success: true; data: GraficiKpi } | { success: false; error: string }> {
  await requireAreaAccess("amministrazione");
  const parsed = graficiIncassiFiltroSchema.safeParse(input);
  if (!parsed.success) {
    return {
      success: false,
      error: parsed.error.issues[0]?.message ?? "Filtri non validi.",
    };
  }
  const { anno, mese, clienteId } = parsed.data;
  const { from, to } = yearBounds(anno);
  const supabase = await createClient();

  let query = supabase
    .from("ordini")
    .select("data_ordine, importo_euro, pagato, cliente_id, deleted_at")
    .is("deleted_at", null)
    .eq("pagato", true)
    .gte("data_ordine", from)
    .lte("data_ordine", to);

  if (mese) {
    const range = meseRange(anno, mese);
    query = query
      .gte("data_ordine", range.from)
      .lt("data_ordine", range.toExclusive);
  }
  if (clienteId) {
    query = query.eq("cliente_id", clienteId);
  }

  const { data, error } = await query;
  if (error) return { success: false, error: error.message };

  const points = (data ?? []).map((row) => {
    const dataOrdine = String(
      (row as { data_ordine?: string }).data_ordine ?? ""
    );
    return {
      month: Number(dataOrdine.slice(5, 7)),
      value: Number((row as { importo_euro?: number }).importo_euro) || 0,
    };
  });

  return { success: true, data: accumulateByMonth(anno, points) };
}

export async function getGraficiHomeAnnoAction(
  anno?: number
): Promise<
  | {
      success: true;
      anno: number;
      ordini: GraficiKpi;
      incassi: GraficiKpi;
    }
  | { success: false; error: string }
> {
  await requireAreaAccess("amministrazione");
  const y = anno && anno >= 2000 && anno <= 2100 ? anno : new Date().getFullYear();

  const [ordini, incassi] = await Promise.all([
    getGraficiOrdiniQtyAction({ anno: y, mese: null, prodottoId: null }),
    getGraficiIncassiAction({ anno: y, mese: null, clienteId: null }),
  ]);

  if (!ordini.success) return { success: false, error: ordini.error };
  if (!incassi.success) return { success: false, error: incassi.error };

  return {
    success: true,
    anno: y,
    ordini: ordini.data,
    incassi: incassi.data,
  };
}
