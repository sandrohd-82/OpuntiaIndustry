"use server";

import { writeAuditLog } from "@/lib/audit";
import {
  aggregateRigheConIva,
  commercialistaSummarySchema,
  emptyColonna,
  IVA_AZIENDALE_PCT,
  resolveIvaPercentuale,
  upsertTrimestreCommercialistaSchema,
  type CommercialistaSummary,
  type ImportoConIva,
} from "@/lib/amministrazione/commercialista";
import {
  includeInContabilitaFatturaEmessa,
  roundMoney,
} from "@/lib/amministrazione/fatture";
import {
  dateRangeForTrimestre,
  labelTrimestre,
  type TrimestreNumero,
} from "@/lib/amministrazione/trimestre-commerciale";
import { requireAreaAccess } from "@/lib/areas/guard";
import { createClient } from "@/lib/supabase/server";
import type { TrimestreCommercialistaRow } from "@/types/database";

export type CommercialistaSummaryResult =
  | { success: true; data: CommercialistaSummary }
  | { success: false; error: string };

export type TrimestreCommercialistaResolved = {
  anno: number;
  trimestre: TrimestreNumero;
  labelTrimestre: string;
  dal: string;
  al: string;
  personalizzato: boolean;
  defaultDal: string;
  defaultAl: string;
  id: string | null;
};

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

async function resolvePeriodoTrimestre(
  anno: number,
  trimestre: TrimestreNumero
): Promise<
  | { ok: true; periodo: TrimestreCommercialistaResolved }
  | { ok: false; error: string }
> {
  const defaults = dateRangeForTrimestre(anno, trimestre);
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("trimestri_commercialista")
    .select("*")
    .eq("anno", anno)
    .eq("trimestre", trimestre)
    .is("deleted_at", null)
    .maybeSingle();
  if (error) return { ok: false, error: error.message };

  const row = data as TrimestreCommercialistaRow | null;
  if (row) {
    return {
      ok: true,
      periodo: {
        anno,
        trimestre,
        labelTrimestre: labelTrimestre(anno, trimestre),
        dal: String(row.dal).slice(0, 10),
        al: String(row.al).slice(0, 10),
        personalizzato: true,
        defaultDal: defaults.dal,
        defaultAl: defaults.al,
        id: row.id,
      },
    };
  }

  return {
    ok: true,
    periodo: {
      anno,
      trimestre,
      labelTrimestre: labelTrimestre(anno, trimestre),
      dal: defaults.dal,
      al: defaults.al,
      personalizzato: false,
      defaultDal: defaults.dal,
      defaultAl: defaults.al,
      id: null,
    },
  };
}

export async function getTrimestreCommercialistaAction(input: {
  anno: number;
  trimestre: TrimestreNumero;
}): Promise<
  | { success: true; data: TrimestreCommercialistaResolved }
  | { success: false; error: string }
> {
  await requireAreaAccess("area-fiscale");
  const parsed = commercialistaSummarySchema.safeParse(input);
  if (!parsed.success) {
    return {
      success: false,
      error: parsed.error.issues[0]?.message ?? "Parametri non validi.",
    };
  }
  const res = await resolvePeriodoTrimestre(
    parsed.data.anno,
    parsed.data.trimestre
  );
  if (!res.ok) return { success: false, error: res.error };
  return { success: true, data: res.periodo };
}

export async function upsertTrimestreCommercialistaAction(
  raw: unknown
): Promise<
  | { success: true; data: TrimestreCommercialistaResolved }
  | { success: false; error: string }
> {
  const { auth } = await requireAreaAccess("area-fiscale");
  const parsed = upsertTrimestreCommercialistaSchema.safeParse(raw);
  if (!parsed.success) {
    return {
      success: false,
      error: parsed.error.issues[0]?.message ?? "Date non valide.",
    };
  }
  const { anno, trimestre, dal, al, note } = parsed.data;
  const supabase = await createClient();

  const { data: existing, error: exErr } = await supabase
    .from("trimestri_commercialista")
    .select("id")
    .eq("anno", anno)
    .eq("trimestre", trimestre)
    .is("deleted_at", null)
    .maybeSingle();
  if (exErr) return { success: false, error: exErr.message };

  if (existing?.id) {
    const { error } = await supabase
      .from("trimestri_commercialista")
      .update({
        dal,
        al,
        note: note ?? "",
        updated_by: auth.userId,
      })
      .eq("id", existing.id);
    if (error) return { success: false, error: error.message };

    await writeAuditLog({
      entity_type: "trimestri_commercialista",
      entity_id: String(existing.id),
      action: "update",
      actor_id: auth.userId,
      summary: `Aggiornato periodo ${labelTrimestre(anno, trimestre)}: ${dal} → ${al}`,
      payload: { anno, trimestre, dal, al },
    });
  } else {
    const { data: inserted, error } = await supabase
      .from("trimestri_commercialista")
      .insert({
        anno,
        trimestre,
        dal,
        al,
        note: note ?? "",
        created_by: auth.userId,
        updated_by: auth.userId,
      })
      .select("id")
      .single();
    if (error || !inserted) {
      return {
        success: false,
        error: error?.message ?? "Salvataggio periodo non riuscito.",
      };
    }

    await writeAuditLog({
      entity_type: "trimestri_commercialista",
      entity_id: String(inserted.id),
      action: "create",
      actor_id: auth.userId,
      summary: `Creato periodo personalizzato ${labelTrimestre(anno, trimestre)}: ${dal} → ${al}`,
      payload: { anno, trimestre, dal, al },
    });
  }

  const resolved = await resolvePeriodoTrimestre(anno, trimestre);
  if (!resolved.ok) return { success: false, error: resolved.error };
  return { success: true, data: resolved.periodo };
}

/** Ripristina le date di calendario (soft delete della personalizzazione). */
export async function resetTrimestreCommercialistaAction(input: {
  anno: number;
  trimestre: TrimestreNumero;
}): Promise<
  | { success: true; data: TrimestreCommercialistaResolved }
  | { success: false; error: string }
> {
  const { auth } = await requireAreaAccess("area-fiscale");
  const parsed = commercialistaSummarySchema.safeParse(input);
  if (!parsed.success) {
    return {
      success: false,
      error: parsed.error.issues[0]?.message ?? "Parametri non validi.",
    };
  }
  const { anno, trimestre } = parsed.data;
  const supabase = await createClient();
  const nowIso = new Date().toISOString();

  const { data: existing } = await supabase
    .from("trimestri_commercialista")
    .select("id")
    .eq("anno", anno)
    .eq("trimestre", trimestre)
    .is("deleted_at", null)
    .maybeSingle();

  if (existing?.id) {
    const { error } = await supabase
      .from("trimestri_commercialista")
      .update({
        deleted_at: nowIso,
        deleted_by: auth.userId,
        updated_by: auth.userId,
      })
      .eq("id", existing.id);
    if (error) return { success: false, error: error.message };

    await writeAuditLog({
      entity_type: "trimestri_commercialista",
      entity_id: String(existing.id),
      action: "soft_delete",
      actor_id: auth.userId,
      summary: `Ripristinato calendario standard ${labelTrimestre(anno, trimestre)}`,
      payload: { anno, trimestre },
    });
  }

  const resolved = await resolvePeriodoTrimestre(anno, trimestre);
  if (!resolved.ok) return { success: false, error: resolved.error };
  return { success: true, data: resolved.periodo };
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
  const periodoRes = await resolvePeriodoTrimestre(anno, trimestre);
  if (!periodoRes.ok) return { success: false, error: periodoRes.error };
  const { dal, al, labelTrimestre: label, personalizzato } = periodoRes.periodo;
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
      .select("importo, is_bene_ammortizzabile, fattura_id, iva_percentuale")
      .in("fattura_id", ricevuteIds);
    if (error) return { success: false, error: error.message };
    ricevuteRighe = (righe ?? []).map((r) => {
      const fatturaId = String(r.fattura_id);
      const fromRiga = Number(r.iva_percentuale);
      const ivaPercentuale =
        Number.isFinite(fromRiga) && fromRiga > 0
          ? fromRiga
          : (ricevuteIvaById.get(fatturaId) ?? IVA_AZIENDALE_PCT);
      return {
        importo: Number(r.importo) || 0,
        isBeneAmmortizzabile: Boolean(r.is_bene_ammortizzabile),
        ivaPercentuale,
      };
    });
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
      labelTrimestre: label,
      dal,
      al,
      periodoPersonalizzato: personalizzato,
      ivaAliquotaDefaultPct: IVA_AZIENDALE_PCT,
      totaleIncassi: emesse.documenti.totale,
      totaleRicevute: ricevute.documenti.totale,
      emesse,
      ricevute,
    },
  };
}
