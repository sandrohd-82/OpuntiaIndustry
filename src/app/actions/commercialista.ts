"use server";

import { writeAuditLog } from "@/lib/audit";
import {
  aggregateRigheConIva,
  commercialistaSummarySchema,
  emptyColonna,
  IVA_AZIENDALE_PCT,
  resolveIvaPercentuale,
  upsertTrimestreCommercialistaSchema,
  type CommercialistaBeneRiga,
  type CommercialistaColonnaTotali,
  type CommercialistaDocumentoRiga,
  type CommercialistaSummary,
  type ImportoConIva,
} from "@/lib/amministrazione/commercialista";
import { assignNumeriVignetta } from "@/lib/amministrazione/elaborazione-contabile";
import { buildElaborazioneFattureXlsx } from "@/lib/amministrazione/elaborazione-fatture-xlsx";
import type { FatturaClassicaStampaModel } from "@/lib/amministrazione/fattura-classica-stampa";
import { comeNotaCredito } from "@/lib/amministrazione/fattura-classica-stampa";
import { fatturaClassicaDaXml } from "@/lib/amministrazione/fattura-pa-xml";
import { nazioneEstera } from "@/lib/amministrazione/nazione-fattura";
import { resolveFicDocumentXml } from "@/lib/amministrazione/fic-document-xml";
import {
  includeInRegistroCommercialista,
  mapFatturaEmessaRow,
  mapFatturaRicevutaRow,
  roundMoney,
  type Fattura,
} from "@/lib/amministrazione/fatture";
import {
  defaultDestinatarioCooperativa,
  extractXmlFromRawSafe,
  mapFicRawToPaperInvoice,
  mapOpuntiaFatturaToPaperInvoice,
  type PaperInvoiceModel,
} from "@/lib/amministrazione/paper-invoice";
import {
  dateRangeForTrimestre,
  labelTrimestre,
  type TrimestreNumero,
} from "@/lib/amministrazione/trimestre-commerciale";
import { requireAreaAccess } from "@/lib/areas/guard";
import { assertElaboraContabilita } from "@/lib/auth/elabora-contabilita";
import { createClient } from "@/lib/supabase/server";
import type {
  ElaborazioneContabileInsert,
  ElaborazioneContabileKind,
  ElaborazioneContabileVoceInsert,
  FatturaEmessaDilazioneRow,
  FatturaEmessaRigaRow,
  FatturaEmessaRow,
  FatturaRicevutaContributoCassaRow,
  FatturaRicevutaDilazioneRow,
  FatturaRicevutaRigaRow,
  FatturaRicevutaRow,
  TrimestreCommercialistaRow,
} from "@/types/database";

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
      "id, imponibile, imposta, totale, iva_percentuale, tipo_documento, stato_pagamento, fattura_collegata_id, numero_interno, data_emissione, cliente_ragione_sociale"
    )
    .is("deleted_at", null)
    .gte("data_emissione", dal)
    .lte("data_emissione", al)
    .order("data_emissione", { ascending: true })
    .order("numero_interno", { ascending: true });
  if (emesseErr) return { success: false, error: emesseErr.message };

  const emesseOk = (emesseRows ?? []).filter((r) =>
    includeInRegistroCommercialista({
      tipo_documento: r.tipo_documento,
      stato_pagamento: r.stato_pagamento,
      fattura_collegata_id: r.fattura_collegata_id,
      numero_interno: r.numero_interno,
    })
  );

  const { data: ricevuteRows, error: ricevuteErr } = await supabase
    .from("fatture_ricevute")
    .select(
      "id, imponibile, imposta, totale, iva_percentuale, numero_interno, data_emissione, fornitore_ragione_sociale"
    )
    .is("deleted_at", null)
    .gte("data_emissione", dal)
    .lte("data_emissione", al)
    .order("data_emissione", { ascending: true })
    .order("numero_interno", { ascending: true });
  if (ricevuteErr) return { success: false, error: ricevuteErr.message };

  const ricevuteOk = ricevuteRows ?? [];

  const sequenzaEmesse = sequenzaCrescentePerData(
    emesseOk.map((r) => ({
      id: String(r.id),
      data: String(r.data_emissione ?? ""),
      numero: String(r.numero_interno ?? ""),
    }))
  );
  const sequenzaRicevute = sequenzaCrescentePerData(
    ricevuteOk.map((r) => ({
      id: String(r.id),
      data: String(r.data_emissione ?? ""),
      numero: String(r.numero_interno ?? ""),
    }))
  );

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

  type RigaRaw = {
    id: string;
    fattura_id: string;
    descrizione: string;
    importo: number;
    is_bene_ammortizzabile: boolean;
    iva_percentuale?: number | null;
  };

  let emesseRigheDb: RigaRaw[] = [];
  if (emesseIds.length > 0) {
    const { data: righe, error } = await supabase
      .from("fatture_emesse_righe")
      .select(
        "id, importo, is_bene_ammortizzabile, fattura_id, iva_percentuale, descrizione"
      )
      .in("fattura_id", emesseIds)
      .is("deleted_at", null);
    if (error) return { success: false, error: error.message };
    emesseRigheDb = (righe ?? []) as RigaRaw[];
  }

  let ricevuteRigheDb: RigaRaw[] = [];
  if (ricevuteIds.length > 0) {
    const { data: righe, error } = await supabase
      .from("fatture_ricevute_righe")
      .select(
        "id, importo, is_bene_ammortizzabile, fattura_id, iva_percentuale, descrizione"
      )
      .in("fattura_id", ricevuteIds);
    if (error) return { success: false, error: error.message };
    ricevuteRigheDb = (righe ?? []) as RigaRaw[];
  }

  const emesseNumeroById = new Map(
    emesseOk.map((r) => [String(r.id), String(r.numero_interno ?? "")])
  );
  const ricevuteNumeroById = new Map(
    ricevuteOk.map((r) => [String(r.id), String(r.numero_interno ?? "")])
  );

  const emesseAgg = aggregateRigheConIva(
    emesseRigheDb.map((r) => {
      const fatturaId = String(r.fattura_id);
      const fromRiga = Number(r.iva_percentuale);
      return {
        importo: Number(r.importo) || 0,
        isBeneAmmortizzabile: Boolean(r.is_bene_ammortizzabile),
        ivaPercentuale:
          Number.isFinite(fromRiga) && fromRiga > 0
            ? fromRiga
            : (emesseIvaById.get(fatturaId) ?? IVA_AZIENDALE_PCT),
      };
    })
  );
  const ricevuteAgg = aggregateRigheConIva(
    ricevuteRigheDb.map((r) => {
      const fatturaId = String(r.fattura_id);
      const fromRiga = Number(r.iva_percentuale);
      return {
        importo: Number(r.importo) || 0,
        isBeneAmmortizzabile: Boolean(r.is_bene_ammortizzabile),
        ivaPercentuale:
          Number.isFinite(fromRiga) && fromRiga > 0
            ? fromRiga
            : (ricevuteIvaById.get(fatturaId) ?? IVA_AZIENDALE_PCT),
      };
    })
  );

  const emesse = buildColonna({
    testate: emesseOk.map((r) => ({
      id: String(r.id),
      numeroInterno: String(r.numero_interno ?? ""),
      dataEmissione: String(r.data_emissione ?? ""),
      anagraficaRagioneSociale: String(r.cliente_ragione_sociale ?? ""),
      totale: Number(r.totale) || 0,
      imponibile: Number(r.imponibile) || 0,
      imposta: Number(r.imposta) || 0,
      notaCredito:
        r.tipo_documento === "nota_credito" ||
        String(r.numero_interno ?? "").toUpperCase().startsWith("NC-"),
    })),
    righe: emesseRigheDb,
    numeroById: emesseNumeroById,
    sequenzaById: sequenzaEmesse,
    agg: emesseAgg,
  });

  const ricevute = buildColonna({
    testate: ricevuteOk.map((r) => ({
      id: String(r.id),
      numeroInterno: String(r.numero_interno ?? ""),
      dataEmissione: String(r.data_emissione ?? ""),
      anagraficaRagioneSociale: String(r.fornitore_ragione_sociale ?? ""),
      totale: Number(r.totale) || 0,
      imponibile: Number(r.imponibile) || 0,
      imposta: Number(r.imposta) || 0,
    })),
    righe: ricevuteRigheDb,
    numeroById: ricevuteNumeroById,
    sequenzaById: sequenzaRicevute,
    agg: ricevuteAgg,
  });

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
      totaleFattureEmesse: emesse.documenti.totale,
      totaleRicevute: ricevute.documenti.totale,
      emesse,
      ricevute,
    },
  };
}

/** 1 sulla data più vecchia, poi in ordine fino alla più recente. */
function sequenzaCrescentePerData(
  rows: { id: string; data: string; numero: string }[]
): Map<string, number> {
  const ordinati = [...rows].sort((a, b) => {
    if (a.data !== b.data) return a.data < b.data ? -1 : 1;
    return a.numero.localeCompare(b.numero, "it");
  });
  const map = new Map<string, number>();
  ordinati.forEach((row, index) => {
    map.set(row.id, index + 1);
  });
  return map;
}

function buildColonna(input: {
  testate: Array<{
    id: string;
    numeroInterno: string;
    dataEmissione: string;
    anagraficaRagioneSociale: string;
    totale: number;
    imponibile: number;
    imposta: number;
    notaCredito?: boolean;
  }>;
  righe: Array<{
    id: string;
    fattura_id: string;
    descrizione: string;
    importo: number;
    is_bene_ammortizzabile: boolean;
  }>;
  numeroById: Map<string, string>;
  sequenzaById: Map<string, number>;
  agg: ReturnType<typeof aggregateRigheConIva>;
}): CommercialistaColonnaTotali {
  const col = emptyColonna();
  col.conteggioDocumenti = input.testate.length;
  col.documenti = documentiDaTestate(input.testate);
  col.vocePrimaria = input.agg.vocePrimaria;
  col.beniAmmortizzabili = input.agg.beniAmmortizzabili;

  const beniLista: CommercialistaBeneRiga[] = [];
  let nPrimarie = 0;
  let nBeni = 0;
  for (const r of input.righe) {
    const fatturaId = String(r.fattura_id);
    if (r.is_bene_ammortizzabile) {
      nBeni += 1;
      beniLista.push({
        rigaId: String(r.id),
        fatturaId,
        numeroInterno: input.numeroById.get(fatturaId) ?? "",
        descrizione: String(r.descrizione ?? "").trim() || "—",
        importo: Number(r.importo) || 0,
        numeroSequenza: input.sequenzaById.get(fatturaId) ?? null,
      });
    } else {
      nPrimarie += 1;
    }
  }
  col.conteggioVociPrimarie = nPrimarie;
  col.conteggioBeniAmmortizzabili = nBeni;
  col.beniLista = beniLista;

  const documentiLista: CommercialistaDocumentoRiga[] = input.testate.map(
    (t) => ({
      id: t.id,
      numeroInterno: t.numeroInterno,
      dataEmissione: t.dataEmissione,
      anagraficaRagioneSociale: t.anagraficaRagioneSociale,
      totale: t.totale,
      numeroSequenza: input.sequenzaById.get(t.id) ?? null,
      notaCredito: Boolean(t.notaCredito),
    })
  );
  col.documentiLista = documentiLista;
  return col;
}

/**
 * Assegna sequenza numerica 1…N a tutte le fatture del periodo (ordine data),
 * stile «matita» commercialista — persistita in elaborazioni_contabili.
 */
export async function applySequenzaCommercialistaAction(input: {
  kind: ElaborazioneContabileKind;
  anno: number;
  trimestre: TrimestreNumero;
}): Promise<
  | { success: true; assegnati: number }
  | { success: false; error: string }
> {
  const { auth } = await requireAreaAccess("area-fiscale");
  const elabGate = await assertElaboraContabilita();
  if (!elabGate.ok) return { success: false, error: elabGate.error };
  const parsed = commercialistaSummarySchema.safeParse({
    anno: input.anno,
    trimestre: input.trimestre,
  });
  if (!parsed.success) {
    return {
      success: false,
      error: parsed.error.issues[0]?.message ?? "Parametri non validi.",
    };
  }
  if (input.kind !== "emessa" && input.kind !== "ricevuta") {
    return { success: false, error: "Tipo documento non valido." };
  }

  const periodoRes = await resolvePeriodoTrimestre(
    parsed.data.anno,
    parsed.data.trimestre
  );
  if (!periodoRes.ok) return { success: false, error: periodoRes.error };
  const { dal, al } = periodoRes.periodo;
  const { anno, trimestre } = parsed.data;
  const supabase = await createClient();

  let fatturaIds: string[] = [];
  if (input.kind === "emessa") {
    const { data, error } = await supabase
      .from("fatture_emesse")
      .select(
        "id, numero_interno, tipo_documento, stato_pagamento, fattura_collegata_id, data_emissione"
      )
      .is("deleted_at", null)
      .gte("data_emissione", dal)
      .lte("data_emissione", al)
      .order("data_emissione", { ascending: true })
      .order("numero_interno", { ascending: true });
    if (error) return { success: false, error: error.message };
    fatturaIds = (data ?? [])
      .filter((r) =>
        includeInRegistroCommercialista({
          tipo_documento: r.tipo_documento,
          stato_pagamento: r.stato_pagamento,
          fattura_collegata_id: r.fattura_collegata_id,
          numero_interno: r.numero_interno,
        })
      )
      .map((r) => String(r.id));
  } else {
    const { data, error } = await supabase
      .from("fatture_ricevute")
      .select("id, data_emissione, numero_interno")
      .is("deleted_at", null)
      .gte("data_emissione", dal)
      .lte("data_emissione", al)
      .order("data_emissione", { ascending: true })
      .order("numero_interno", { ascending: true });
    if (error) return { success: false, error: error.message };
    fatturaIds = (data ?? []).map((r) => String(r.id));
  }

  const numbered = assignNumeriVignetta(
    fatturaIds.map((fatturaId) => ({
      fatturaId,
      numeraConVignetta: true,
    }))
  );

  const { data: existing, error: findErr } = await supabase
    .from("elaborazioni_contabili")
    .select("*")
    .eq("kind", input.kind)
    .eq("anno", anno)
    .eq("trimestre", trimestre)
    .is("deleted_at", null)
    .maybeSingle();
  if (findErr) return { success: false, error: findErr.message };

  let elaborazioneId: string;
  let versione = 1;

  if (existing?.id) {
    versione = (existing.versione ?? 1) + 1;
    const { data: updated, error: upErr } = await supabase
      .from("elaborazioni_contabili")
      .update({
        note: "Sequenza numerica commercialista",
        versione,
        updated_by: auth.userId,
      })
      .eq("id", existing.id)
      .select("id")
      .single();
    if (upErr || !updated) {
      return {
        success: false,
        error: upErr?.message ?? "Aggiornamento elaborazione non riuscito.",
      };
    }
    elaborazioneId = updated.id;
    const nowIso = new Date().toISOString();
    await supabase
      .from("elaborazioni_contabili_voci")
      .update({
        deleted_at: nowIso,
        deleted_by: auth.userId,
        updated_by: auth.userId,
      })
      .eq("elaborazione_id", elaborazioneId)
      .is("deleted_at", null);
  } else {
    const insert: ElaborazioneContabileInsert = {
      kind: input.kind,
      anno,
      trimestre,
      documento_stato: "bozza",
      versione: 1,
      note: "Sequenza numerica commercialista",
      created_by: auth.userId,
      updated_by: auth.userId,
    };
    const { data: created, error: insErr } = await supabase
      .from("elaborazioni_contabili")
      .insert(insert)
      .select("id")
      .single();
    if (insErr || !created) {
      return {
        success: false,
        error: insErr?.message ?? "Creazione elaborazione non riuscita.",
      };
    }
    elaborazioneId = created.id;
  }

  const vociInsert: ElaborazioneContabileVoceInsert[] = numbered.map((v) => ({
    elaborazione_id: elaborazioneId,
    fattura_id: v.fatturaId,
    numera_con_vignetta: v.numeraConVignetta,
    numero_vignetta: v.numeroVignetta,
    sort_order: v.sortOrder,
    created_by: auth.userId,
    updated_by: auth.userId,
  }));

  if (vociInsert.length > 0) {
    const { error: vociErr } = await supabase
      .from("elaborazioni_contabili_voci")
      .insert(vociInsert);
    if (vociErr) {
      return { success: false, error: `Voci elaborazione: ${vociErr.message}` };
    }
  }

  await writeAuditLog({
    entity_type: "elaborazioni_contabili",
    entity_id: elaborazioneId,
    action: existing?.id ? "update" : "create",
    actor_id: auth.userId,
    summary: `Sequenza numerica commercialista ${input.kind} ${anno}-T${trimestre}: ${numbered.length} documenti`,
    payload: {
      kind: input.kind,
      anno,
      trimestre,
      dal,
      al,
      assegnati: numbered.length,
    },
  });

  return { success: true, assegnati: numbered.length };
}

export type CommercialistaPaperDoc = {
  id: string;
  numeroInterno: string;
  dataEmissione: string;
  anagraficaRagioneSociale: string;
  numeroSequenza: number | null;
  notaCredito: boolean;
  /** Ricevute: SI se materiale di consumo, NO se c'è un bene ammortizzabile. */
  beneDiConsumo: "SI" | "NO" | null;
  model: PaperInvoiceModel;
  /** Stesso foglio della fattura classica, dati SDI. Ricevute senza piè di pagina. */
  classica: FatturaClassicaStampaModel | null;
  sdiAssente: boolean;
};

async function classicaDaSdi(
  supabase: Awaited<ReturnType<typeof createClient>>,
  ficIdRaw: number | null,
  type: "issued" | "received"
): Promise<FatturaClassicaStampaModel | null> {
  const ficId = Number(ficIdRaw ?? 0);
  if (!Number.isFinite(ficId) || ficId <= 0) return null;
  const { data } = await supabase
    .from("fic_invoices")
    .select("raw_data")
    .eq("fic_id", ficId)
    .eq("type", type)
    .is("deleted_at", null)
    .maybeSingle();
  const raw = (data?.raw_data ?? null) as Record<string, unknown> | null;
  let xml = extractXmlFromRawSafe(raw);
  if (!xml) {
    try {
      const scaricato = await resolveFicDocumentXml({
        kind: type === "issued" ? "emessa" : "ricevuta",
        ficId,
      });
      xml = scaricato.xml;
    } catch (err) {
      console.error("[commercialista sdi]", ficId, err);
      return null;
    }
  }
  try {
    const model = fatturaClassicaDaXml(xml);
    if (!model.destinatario.sdi.trim()) {
      const entity = raw?.entity;
      const eiCode =
        entity && typeof entity === "object"
          ? String((entity as { ei_code?: unknown }).ei_code ?? "").trim()
          : "";
      if (eiCode) model.destinatario.sdi = eiCode;
    }
    const xmlHaNazione = Boolean(
      model.destinatario.nazione.trim() || model.emittente.nazione.trim()
    );
    if (!xmlHaNazione && !model.nazioneEstera) {
      const entity = raw?.entity;
      const country =
        entity && typeof entity === "object"
          ? String((entity as { country?: unknown }).country ?? "").trim()
          : "";
      model.nazioneEstera = nazioneEstera(country);
    }
    model.nascondiPiePagina = type === "received";
    return model;
  } catch (err) {
    console.error("[commercialista sdi xml]", ficId, err);
    return null;
  }
}

async function loadFatturaCompletaForPaper(
  supabase: Awaited<ReturnType<typeof createClient>>,
  kind: ElaborazioneContabileKind,
  id: string
): Promise<
  | { ok: true; fattura: Fattura; classica: FatturaClassicaStampaModel | null }
  | { ok: false; error: string }
> {
  if (kind === "emessa") {
    const { data, error } = await supabase
      .from("fatture_emesse")
      .select("*")
      .eq("id", id)
      .is("deleted_at", null)
      .maybeSingle();
    if (error) return { ok: false, error: error.message };
    if (!data) return { ok: false, error: "Documento non trovato." };
    const { data: righe, error: righeErr } = await supabase
      .from("fatture_emesse_righe")
      .select("*")
      .eq("fattura_id", id)
      .is("deleted_at", null)
      .order("sort_order", { ascending: true });
    if (righeErr) return { ok: false, error: righeErr.message };
    const { data: dilazioni } = await supabase
      .from("fatture_emesse_dilazioni")
      .select("*")
      .eq("fattura_id", id)
      .is("deleted_at", null)
      .order("sort_order", { ascending: true });
    const emessa = data as FatturaEmessaRow;
    const righeEmessa = (righe ?? []) as FatturaEmessaRigaRow[];
    const fattura = mapFatturaEmessaRow(
      emessa,
      righeEmessa,
      (dilazioni ?? []) as FatturaEmessaDilazioneRow[]
    );
    const classica = await classicaDaSdi(supabase, emessa.fic_id, "issued");
    return { ok: true, fattura, classica };
  }

  const { data, error } = await supabase
    .from("fatture_ricevute")
    .select("*")
    .eq("id", id)
    .is("deleted_at", null)
    .maybeSingle();
  if (error) return { ok: false, error: error.message };
  if (!data) return { ok: false, error: "Fattura non trovata." };
  const { data: righe, error: righeErr } = await supabase
    .from("fatture_ricevute_righe")
    .select("*")
    .eq("fattura_id", id)
    .order("sort_order", { ascending: true });
  if (righeErr) return { ok: false, error: righeErr.message };
  const { data: dilazioni } = await supabase
    .from("fatture_ricevute_dilazioni")
    .select("*")
    .eq("fattura_id", id)
    .is("deleted_at", null)
    .order("sort_order", { ascending: true });
  const { data: contributi } = await supabase
    .from("fatture_ricevute_contributi_cassa")
    .select("*")
    .eq("fattura_id", id)
    .is("deleted_at", null)
    .order("sort_order", { ascending: true });
  const ricevuta = data as FatturaRicevutaRow;
  const classica = await classicaDaSdi(supabase, ricevuta.fic_id, "received");
  return {
    ok: true,
    classica,
    fattura: mapFatturaRicevutaRow(
      ricevuta,
      (righe ?? []) as FatturaRicevutaRigaRow[],
      (dilazioni ?? []) as FatturaRicevutaDilazioneRow[],
      (contributi ?? []) as FatturaRicevutaContributoCassaRow[]
    ),
  };
}

async function buildPaperModelForFattura(
  supabase: Awaited<ReturnType<typeof createClient>>,
  fattura: Fattura
): Promise<PaperInvoiceModel> {
  const destinatario = defaultDestinatarioCooperativa();
  if (
    fattura.kind === "ricevuta" &&
    fattura.ficId &&
    Number.isFinite(fattura.ficId) &&
    fattura.ficId > 0
  ) {
    const { data } = await supabase
      .from("fic_invoices")
      .select("raw_data")
      .eq("fic_id", fattura.ficId)
      .eq("type", "received")
      .is("deleted_at", null)
      .maybeSingle();
    const raw = (data?.raw_data ?? null) as Record<string, unknown> | null;
    if (raw && Object.keys(raw).length > 0) {
      return mapFicRawToPaperInvoice(raw, destinatario);
    }
  }
  return mapOpuntiaFatturaToPaperInvoice(fattura, destinatario);
}

/**
 * Carica i fogli stampabili del periodo (ordine data) con eventuale n. sequenza matita.
 */
export async function getCommercialistaPaperBatchAction(input: {
  kind: ElaborazioneContabileKind;
  anno: number;
  trimestre: TrimestreNumero;
}): Promise<
  | {
      success: true;
      docs: CommercialistaPaperDoc[];
      senzaSequenza: number;
      labelPeriodo: string;
    }
  | { success: false; error: string }
> {
  await requireAreaAccess("area-fiscale");
  const parsed = commercialistaSummarySchema.safeParse({
    anno: input.anno,
    trimestre: input.trimestre,
  });
  if (!parsed.success) {
    return {
      success: false,
      error: parsed.error.issues[0]?.message ?? "Parametri non validi.",
    };
  }
  const { anno, trimestre } = parsed.data;
  const periodoRes = await resolvePeriodoTrimestre(anno, trimestre);
  if (!periodoRes.ok) return { success: false, error: periodoRes.error };
  const { dal, al, labelTrimestre: label } = periodoRes.periodo;
  const supabase = await createClient();

  type Testata = {
    id: string;
    numero_interno: string;
    data_emissione: string;
    ragione: string;
  };
  let testate: Testata[] = [];

  if (input.kind === "emessa") {
    const { data, error } = await supabase
      .from("fatture_emesse")
      .select(
        "id, numero_interno, data_emissione, cliente_ragione_sociale, tipo_documento, stato_pagamento, fattura_collegata_id"
      )
      .is("deleted_at", null)
      .gte("data_emissione", dal)
      .lte("data_emissione", al)
      .order("data_emissione", { ascending: true })
      .order("numero_interno", { ascending: true });
    if (error) return { success: false, error: error.message };
    testate = (data ?? [])
      .filter((r) =>
        includeInRegistroCommercialista({
          tipo_documento: r.tipo_documento,
          stato_pagamento: r.stato_pagamento,
          fattura_collegata_id: r.fattura_collegata_id,
          numero_interno: r.numero_interno,
        })
      )
      .map((r) => ({
        id: String(r.id),
        numero_interno: String(r.numero_interno ?? ""),
        data_emissione: String(r.data_emissione ?? ""),
        ragione: String(r.cliente_ragione_sociale ?? ""),
      }));
  } else {
    const { data, error } = await supabase
      .from("fatture_ricevute")
      .select(
        "id, numero_interno, data_emissione, fornitore_ragione_sociale"
      )
      .is("deleted_at", null)
      .gte("data_emissione", dal)
      .lte("data_emissione", al)
      .order("data_emissione", { ascending: true })
      .order("numero_interno", { ascending: true });
    if (error) return { success: false, error: error.message };
    testate = (data ?? []).map((r) => ({
      id: String(r.id),
      numero_interno: String(r.numero_interno ?? ""),
      data_emissione: String(r.data_emissione ?? ""),
      ragione: String(r.fornitore_ragione_sociale ?? ""),
    }));
  }

  const sequenza = sequenzaCrescentePerData(
    testate.map((t) => ({
      id: t.id,
      data: t.data_emissione,
      numero: t.numero_interno,
    }))
  );

  const docs: CommercialistaPaperDoc[] = [];
  for (const t of testate) {
    const loaded = await loadFatturaCompletaForPaper(supabase, input.kind, t.id);
    if (!loaded.ok) {
      console.error("[commercialista paper]", t.id, loaded.error);
      continue;
    }
    const model = await buildPaperModelForFattura(supabase, loaded.fattura);
    const classica =
      loaded.fattura.kind === "nota_credito" && loaded.classica
        ? comeNotaCredito(loaded.classica)
        : loaded.classica;
    docs.push({
      id: t.id,
      numeroInterno: t.numero_interno,
      dataEmissione: t.data_emissione,
      anagraficaRagioneSociale: t.ragione,
      numeroSequenza: sequenza.get(t.id) ?? null,
      notaCredito: loaded.fattura.kind === "nota_credito",
      beneDiConsumo:
        input.kind === "ricevuta"
          ? loaded.fattura.righe.some((r) => r.isBeneAmmortizzabile)
            ? "NO"
            : "SI"
          : null,
      model,
      classica,
      sdiAssente: !classica,
    });
  }

  return {
    success: true,
    docs,
    senzaSequenza: docs.filter((d) => d.numeroSequenza == null).length,
    labelPeriodo: label,
  };
}

export async function auditCommercialistaPaperAction(input: {
  kind: ElaborazioneContabileKind;
  anno: number;
  trimestre: TrimestreNumero;
  mode:
    | "elabora_apri"
    | "stampa_batch"
    | "stampa_singola"
    | "scarica_pdf"
    | "scarica_excel";
  documenti: number;
  mostraSequenza: boolean;
  fatturaId?: string | null;
}): Promise<{ success: true } | { success: false; error: string }> {
  const { auth } = await requireAreaAccess("area-fiscale");
  await writeAuditLog({
    entity_type: "commercialista_stampa",
    entity_id: input.fatturaId ?? `${input.kind}-${input.anno}-T${input.trimestre}`,
    action: "export",
    actor_id: auth.userId,
    summary: `Commercialista ${input.mode} ${input.kind} ${input.anno}-T${input.trimestre} (${input.documenti} doc)`,
    payload: {
      kind: input.kind,
      anno: input.anno,
      trimestre: input.trimestre,
      mode: input.mode,
      documenti: input.documenti,
      mostra_sequenza: input.mostraSequenza,
      fattura_id: input.fatturaId ?? null,
    },
  });
  return { success: true };
}

/** Excel dell'elaborazione: anteprima a parte, qui il file da scaricare. */
export async function scaricaElaborazioneFattureExcelAction(input: {
  kind: ElaborazioneContabileKind;
  anno: number;
  trimestre: TrimestreNumero;
}): Promise<
  | { success: true; filename: string; base64: string }
  | { success: false; error: string }
> {
  const batch = await getCommercialistaPaperBatchAction(input);
  if (!batch.success) return batch;
  const file = await buildElaborazioneFattureXlsx({
    kind: input.kind,
    anno: input.anno,
    trimestre: input.trimestre,
    docs: batch.docs,
  });
  const audit = await auditCommercialistaPaperAction({
    kind: input.kind,
    anno: input.anno,
    trimestre: input.trimestre,
    mode: "scarica_excel",
    documenti: batch.docs.length,
    mostraSequenza: true,
  });
  if (!audit.success) return audit;
  return { success: true, filename: file.filename, base64: file.base64 };
}

