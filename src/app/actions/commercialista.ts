"use server";

import {
  aggregateRigheImporti,
  buildPeriodoLabel,
  commercialistaSummarySchema,
  emptyColonna,
  type CommercialistaSummary,
} from "@/lib/amministrazione/commercialista";
import { includeInContabilitaFatturaEmessa } from "@/lib/amministrazione/fatture";
import { requireAreaAccess } from "@/lib/areas/guard";
import { createClient } from "@/lib/supabase/server";

export type CommercialistaSummaryResult =
  | { success: true; data: CommercialistaSummary }
  | { success: false; error: string };

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
      "id, totale, tipo_documento, stato_pagamento, fattura_collegata_id, numero_interno"
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
    .select("id, totale")
    .is("deleted_at", null)
    .gte("data_emissione", dal)
    .lte("data_emissione", al);
  if (ricevuteErr) return { success: false, error: ricevuteErr.message };

  const ricevuteOk = ricevuteRows ?? [];

  const emesseIds = emesseOk.map((r) => String(r.id));
  const ricevuteIds = ricevuteOk.map((r) => String(r.id));

  let emesseRighe: Array<{
    importo: number;
    isBeneAmmortizzabile: boolean;
  }> = [];
  if (emesseIds.length > 0) {
    const { data: righe, error } = await supabase
      .from("fatture_emesse_righe")
      .select("importo, is_bene_ammortizzabile, fattura_id")
      .in("fattura_id", emesseIds);
    if (error) return { success: false, error: error.message };
    emesseRighe = (righe ?? []).map((r) => ({
      importo: Number(r.importo) || 0,
      isBeneAmmortizzabile: Boolean(r.is_bene_ammortizzabile),
    }));
  }

  let ricevuteRighe: Array<{
    importo: number;
    isBeneAmmortizzabile: boolean;
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
    }));
  }

  const emesseAgg = aggregateRigheImporti(emesseRighe);
  const ricevuteAgg = aggregateRigheImporti(ricevuteRighe);

  const emesse = emptyColonna();
  emesse.conteggioDocumenti = emesseOk.length;
  emesse.totaleDocumenti = emesseOk.reduce(
    (s, r) => s + (Number(r.totale) || 0),
    0
  );
  emesse.vocePrimaria = emesseAgg.vocePrimaria;
  emesse.beniAmmortizzabili = emesseAgg.beniAmmortizzabili;

  const ricevute = emptyColonna();
  ricevute.conteggioDocumenti = ricevuteOk.length;
  ricevute.totaleDocumenti = ricevuteOk.reduce(
    (s, r) => s + (Number(r.totale) || 0),
    0
  );
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
      emesse,
      ricevute,
    },
  };
}
