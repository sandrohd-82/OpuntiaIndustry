"use server";

import {
  aggregateRigheConIva,
  buildPeriodoLabel,
  commercialistaSummarySchema,
  emptyColonna,
  IVA_AZIENDALE_PCT,
  resolveIvaPercentuale,
  type CommercialistaSummary,
  type ImportoConIva,
} from "@/lib/amministrazione/commercialista";
import {
  includeInContabilitaFatturaEmessa,
  roundMoney,
} from "@/lib/amministrazione/fatture";
import { requireAreaAccess } from "@/lib/areas/guard";
import { createClient } from "@/lib/supabase/server";

export type CommercialistaSummaryResult =
  | { success: true; data: CommercialistaSummary }
  | { success: false; error: string };

function documentiDaTestate(
  rows: Array<{
    imponibile?: number | null;
    imposta?: number | null;
    totale?: number | null;
  }>
): ImportoConIva {
  let imponibile = 0;
  let iva = 0;
  let totale = 0;
  for (const r of rows) {
    imponibile += Number(r.imponibile) || 0;
    iva += Number(r.imposta) || 0;
    totale += Number(r.totale) || 0;
  }
  return {
    imponibile: roundMoney(imponibile),
    iva: roundMoney(iva),
    totale: roundMoney(totale),
  };
}

export async function getCommercialistaSummaryAction(
  raw: unknown
): Promise<CommercialistaSummaryResult> {
  await requireAreaAccess("area-fiscale");
  const parsed = commercialistaSummarySchema.safeParse(raw);
  if (!parsed.success) {
    return {
      success: false,
      error: parsed.error.issues[0]?.message ?? "Parametri non validi.",
    };
  }

  const { anno, trimestre } = parsed.data;
  const { labelTrimestre, dal, al } = buildPeriodoLabel(anno, trimestre);
  const supabase = await createClient();

  const { data: emesseRows, error: emesseErr } = await supabase
    .from("fatture_emesse")
    .select(
      "id, imponibile, imposta, totale, iva_percentuale, tipo_documento, stato_pagamento, fattura_collegata_id, numero_interno"
    )
    .is("deleted_at", null)
    .gte("data_emissione", dal)
    .lte("data_emissione", al);
  if (emesseErr) return { success: false, error: emesseErr.message };

  const emesseOk = (emesseRows ?? []).filter((r) => {
    if (String(r.numero_interno ?? "").toUpperCase().startsWith("NC-")) {
      return false;
    }
    return includeInContabilitaFatturaEmessa({
      tipo_documento: r.tipo_documento,
      stato_pagamento: r.stato_pagamento,
      fattura_collegata_id: r.fattura_collegata_id,
    });
  });

  const { data: ricevuteRows, error: ricevuteErr } = await supabase
    .from("fatture_ricevute")
    .select("id, imponibile, imposta, totale, iva_percentuale")
    .is("deleted_at", null)
    .gte("data_emissione", dal)
    .lte("data_emissione", al);
  if (ricevuteErr) return { success: false, error: ricevuteErr.message };

  const ricevuteOk = ricevuteRows ?? [];

  const emesseIvaById = new Map(
    emesseOk.map((r) => [
      String(r.id),
      resolveIvaPercentuale(r.iva_percentuale),
    ])
  );
  const ricevuteIvaById = new Map(
    ricevuteOk.map((r) => [
      String(r.id),
      resolveIvaPercentuale(r.iva_percentuale),
    ])
  );

  const emesseIds = [...emesseIvaById.keys()];
  const ricevuteIds = [...ricevuteIvaById.keys()];

  let emesseRighe: Array<{
    importo: number;
    isBeneAmmortizzabile: boolean;
    ivaPercentuale: number;
  }> = [];
  if (emesseIds.length > 0) {
    const { data: righe, error } = await supabase
      .from("fatture_emesse_righe")
      .select("importo, is_bene_ammortizzabile, fattura_id, iva_percentuale")
      .in("fattura_id", emesseIds);
    if (error) return { success: false, error: error.message };
    emesseRighe = (righe ?? []).map((r) => {
      const fatturaId = String(r.fattura_id);
      const fromRiga = Number(r.iva_percentuale);
      const ivaPercentuale =
        Number.isFinite(fromRiga) && fromRiga > 0
          ? fromRiga
          : (emesseIvaById.get(fatturaId) ?? IVA_AZIENDALE_PCT);
      return {
        importo: Number(r.importo) || 0,
        isBeneAmmortizzabile: Boolean(r.is_bene_ammortizzabile),
        ivaPercentuale,
      };
    });
  }

  let ricevuteRighe: Array<{
    importo: number;
    isBeneAmmortizzabile: boolean;
    ivaPercentuale: number;
  }> = [];
  if (ricevuteIds.length > 0) {
    const { data: righe, error } = await supabase
      .from("fatture_ricevute_righe")
      .select("importo, is_bene_ammortizzabile, fattura_id")
      .in("fattura_id", ricevuteIds);
    if (error) return { success: false, error: error.message };
    ricevuteRighe = (righe ?? []).map((r) => ({
      importo: Number(r.importo) || 0,
      isBeneAmmortizzabile: Boolean(r.is_bene_ammortizzabile),
      ivaPercentuale:
        ricevuteIvaById.get(String(r.fattura_id)) ?? IVA_AZIENDALE_PCT,
    }));
  }

  const emesseAgg = aggregateRigheConIva(emesseRighe);
  const ricevuteAgg = aggregateRigheConIva(ricevuteRighe);

  const emesse = emptyColonna();
  emesse.conteggioDocumenti = emesseOk.length;
  emesse.documenti = documentiDaTestate(emesseOk);
  emesse.vocePrimaria = emesseAgg.vocePrimaria;
  emesse.beniAmmortizzabili = emesseAgg.beniAmmortizzabili;

  const ricevute = emptyColonna();
  ricevute.conteggioDocumenti = ricevuteOk.length;
  ricevute.documenti = documentiDaTestate(ricevuteOk);
  ricevute.vocePrimaria = ricevuteAgg.vocePrimaria;
  ricevute.beniAmmortizzabili = ricevuteAgg.beniAmmortizzabili;

  return {
    success: true,
    data: {
      anno,
      trimestre,
      labelTrimestre,
      dal,
      al,
      ivaAliquotaDefaultPct: IVA_AZIENDALE_PCT,
      emesse,
      ricevute,
    },
  };
}
