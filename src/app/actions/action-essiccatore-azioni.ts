"use server";

import { writeAuditLog } from "@/lib/audit";
import {
  avvioEssiccatoreInputSchema,
  condizioneStimaSchema,
  buildMessaggiArresto,
  buildMessaggiAvvio,
  type ActionEssiccatoreAzione,
  type ActionEssiccatoreIotMessaggio,
  type AzioneEsecuzioneKey,
  type IotCanaleAvvio,
  type IotStatoMessaggio,
} from "@/lib/action/azioni-immediate";
import {
  CAMPIONI_DIDATTICI,
  SEME_TEMP_AMBIENTE_C,
  SEME_UMIDITA_PCT,
  stimaPercBruciatore,
  type MlCampione,
  type StimaBruciatore,
} from "@/lib/action/essiccatore-apprendimento";
import {
  kgDaFoglioLavorazione,
  type CondizioniAvvioAuto,
} from "@/lib/action/essiccatore-condizioni-auto";
import { ACTION_ESSICCATORI, ACTION_ESSICCATORE_IDS } from "@/lib/action/essiccatori";
import { requireAreaAccess } from "@/lib/areas/guard";
import { createServiceClient } from "@/lib/supabase/server";
import { z } from "zod";

const AZIONE_COLS =
  "id, essiccatore_id, azione_key, versione, documento_stato, consenso_bruciatore, temp_bruciatore_c, consenso_ventola, perc_ventilazione, kg_prodotto, temp_ambiente_c, umidita_ambiente_pct, perc_bruciatore_prevista, iot_stato, created_at";

type AzioneRow = {
  id: string;
  essiccatore_id: string;
  azione_key: AzioneEsecuzioneKey;
  versione: number;
  documento_stato: ActionEssiccatoreAzione["documentoStato"];
  consenso_bruciatore: boolean;
  temp_bruciatore_c: number;
  consenso_ventola: boolean;
  perc_ventilazione: number;
  kg_prodotto: number | string;
  temp_ambiente_c: number | string;
  umidita_ambiente_pct: number;
  perc_bruciatore_prevista: number;
  iot_stato: IotStatoMessaggio;
  created_at: string;
};

type MessaggioRow = {
  id: string;
  azione_id: string;
  canale: IotCanaleAvvio;
  comando: string;
  payload: Record<string, unknown> | null;
  sort_order: number;
  stato: IotStatoMessaggio;
};

type CampioneRow = {
  id: string;
  essiccatore_id: string;
  kg_prodotto: number | string;
  temp_ambiente_c: number | string;
  umidita_ambiente_pct: number;
  perc_ventilazione: number;
  perc_bruciatore: number;
  temp_obiettivo_c: number;
  temp_tenuta_c: number | string;
  note: string | null;
};

function num(v: number | string): number {
  return typeof v === "number" ? v : Number(v);
}

function mapMessaggio(row: MessaggioRow): ActionEssiccatoreIotMessaggio {
  return {
    id: row.id,
    azioneId: row.azione_id,
    canale: row.canale,
    comando: row.comando,
    payload: row.payload ?? {},
    sortOrder: row.sort_order,
    stato: row.stato,
  };
}

function mapAzione(
  row: AzioneRow,
  messaggi: ActionEssiccatoreIotMessaggio[]
): ActionEssiccatoreAzione {
  return {
    id: row.id,
    essiccatoreId: row.essiccatore_id,
    azioneKey: row.azione_key,
    versione: row.versione,
    documentoStato: row.documento_stato,
    consensoBruciatore: row.consenso_bruciatore,
    tempBruciatoreC: row.temp_bruciatore_c,
    consensoVentola: row.consenso_ventola,
    percVentilazione: row.perc_ventilazione,
    kgProdotto: num(row.kg_prodotto),
    tempAmbienteC: num(row.temp_ambiente_c),
    umiditaAmbientePct: row.umidita_ambiente_pct,
    percBruciatorePrevista: row.perc_bruciatore_prevista,
    iotStato: row.iot_stato,
    createdAt: row.created_at,
    messaggi: [...messaggi].sort((a, b) => a.sortOrder - b.sortOrder),
  };
}

function mapCampione(row: CampioneRow): MlCampione {
  return {
    id: row.id,
    essiccatoreId: row.essiccatore_id,
    kgProdotto: num(row.kg_prodotto),
    tempAmbienteC: num(row.temp_ambiente_c),
    umiditaAmbientePct: row.umidita_ambiente_pct,
    percVentilazione: row.perc_ventilazione,
    percBruciatore: row.perc_bruciatore,
    tempObiettivoC: row.temp_obiettivo_c,
    tempTenutaC: num(row.temp_tenuta_c),
    note: row.note ?? "",
  };
}

async function loadUltimaLettura(
  essiccatoreId: string,
  codice: string
): Promise<{ valore: number; lettoAt: string } | null> {
  const supabase = createServiceClient();
  const { data, error } = await supabase
    .from("action_essiccatore_sensor_letture")
    .select("valore_num, letto_at")
    .eq("essiccatore_id", essiccatoreId)
    .eq("sensore_codice", codice)
    .is("deleted_at", null)
    .order("letto_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  if (error || !data) return null;
  return {
    valore: Number(data.valore_num),
    lettoAt: String(data.letto_at),
  };
}

async function loadCondizioniAuto(
  essiccatoreId: string
): Promise<CondizioniAvvioAuto> {
  const kg = await kgDaFoglioLavorazione(essiccatoreId);
  const temp = await loadUltimaLettura(essiccatoreId, "TEMP-AMB");
  const umid = await loadUltimaLettura(essiccatoreId, "UMID-AMB");
  const haClima = Boolean(temp || umid);
  return {
    essiccatoreId,
    kgProdotto: kg.kg,
    kgFonte: kg.fonte,
    kgNota: kg.nota,
    tempAmbienteC: temp?.valore ?? SEME_TEMP_AMBIENTE_C,
    umiditaAmbientePct: Math.round(umid?.valore ?? SEME_UMIDITA_PCT),
    climaFonte: haClima ? "sonda" : "assente",
    climaLettoAt: temp?.lettoAt ?? umid?.lettoAt ?? null,
    climaNota: haClima
      ? "Ultima lettura sonde TEMP-AMB e UMID-AMB."
      : "Nessuna lettura clima in archivio. In attesa della sonda periodica.",
  };
}

export async function getCondizioniAvvioAutoAction(
  essiccatoreId: string
): Promise<
  | { success: true; condizioni: CondizioniAvvioAuto }
  | { success: false; error: string }
> {
  await requireAreaAccess("action");
  return { success: true, condizioni: await loadCondizioniAuto(essiccatoreId) };
}

async function loadCampioni(essiccatoreId?: string): Promise<MlCampione[]> {
  const supabase = createServiceClient();
  let q = supabase
    .from("action_essiccatore_ml_campioni")
    .select(
      "id, essiccatore_id, kg_prodotto, temp_ambiente_c, umidita_ambiente_pct, perc_ventilazione, perc_bruciatore, temp_obiettivo_c, temp_tenuta_c, note"
    )
    .is("deleted_at", null)
    .eq("esito", "stabile")
    .eq("documento_stato", "approvato");
  if (essiccatoreId) q = q.eq("essiccatore_id", essiccatoreId);
  const { data, error } = await q;
  if (error || !data?.length) {
    return CAMPIONI_DIDATTICI.filter((c) =>
      essiccatoreId ? c.essiccatoreId === essiccatoreId : true
    );
  }
  return (data as CampioneRow[]).map(mapCampione);
}

export async function listMlCampioniAction(essiccatoreId?: string): Promise<
  { success: true; items: MlCampione[] } | { success: false; error: string }
> {
  await requireAreaAccess("action");
  return { success: true, items: await loadCampioni(essiccatoreId) };
}

export async function stimaAvvioEssiccatoreAction(raw: unknown): Promise<
  { success: true; stima: StimaBruciatore } | { success: false; error: string }
> {
  await requireAreaAccess("action");
  const parsed = condizioneStimaSchema.safeParse(raw);
  if (!parsed.success) {
    return { success: false, error: "Condizioni di stima non valide." };
  }
  const auto = await loadCondizioniAuto(parsed.data.essiccatoreId);
  const campioni = await loadCampioni(parsed.data.essiccatoreId);
  return {
    success: true,
    stima: stimaPercBruciatore(
      {
        essiccatoreId: parsed.data.essiccatoreId,
        kgProdotto: auto.kgProdotto,
        tempAmbienteC: auto.tempAmbienteC,
        umiditaAmbientePct: auto.umiditaAmbientePct,
        percVentilazione: parsed.data.percVentilazione,
        tempObiettivoC: parsed.data.tempBruciatoreC,
      },
      campioni
    ),
  };
}

export async function avviaEssiccatoreAction(
  raw: unknown
): Promise<
  { success: true; item: ActionEssiccatoreAzione } | { success: false; error: string }
> {
  const { auth } = await requireAreaAccess("action");
  const parsed = avvioEssiccatoreInputSchema.safeParse(raw);
  if (!parsed.success) {
    return {
      success: false,
      error: parsed.error.issues[0]?.message ?? "Settaggi di avvio non validi.",
    };
  }

  const ess = ACTION_ESSICCATORI.find((e) => e.id === parsed.data.essiccatoreId);
  if (!ess) {
    return { success: false, error: "Essiccatore non trovato." };
  }

  const auto = await loadCondizioniAuto(parsed.data.essiccatoreId);
  const kgManuale = parsed.data.kgManuale;
  const haManuale = typeof kgManuale === "number";
  if (!haManuale && auto.kgFonte === "foglio_assente") {
    return {
      success: false,
      error:
        "Indica il carico essiccatore (icona matita) oppure collegalo dal foglio di lavoro.",
    };
  }
  const kgProdotto = haManuale ? kgManuale : auto.kgProdotto;
  const kgFonte = haManuale ? "manuale" : auto.kgFonte;
  const campioni = await loadCampioni(parsed.data.essiccatoreId);
  const stima = stimaPercBruciatore(
    {
      essiccatoreId: parsed.data.essiccatoreId,
      kgProdotto,
      tempAmbienteC: auto.tempAmbienteC,
      umiditaAmbientePct: auto.umiditaAmbientePct,
      percVentilazione: parsed.data.percVentilazione,
      tempObiettivoC: parsed.data.tempBruciatoreC,
    },
    campioni
  );

  const drafts = buildMessaggiAvvio({
    ...parsed.data,
    percBruciatore: stima.percBruciatore,
  });
  const supabase = createServiceClient();

  const { data: azioneRow, error: azioneErr } = await supabase
    .from("action_essiccatore_azioni")
    .insert({
      essiccatore_id: parsed.data.essiccatoreId,
      azione_key: "avvio",
      versione: 1,
      documento_stato: "eseguito",
      consenso_bruciatore: parsed.data.consensoBruciatore,
      temp_bruciatore_c: parsed.data.tempBruciatoreC,
      consenso_ventola: parsed.data.consensoVentola,
      perc_ventilazione: parsed.data.percVentilazione,
      kg_prodotto: kgProdotto,
      temp_ambiente_c: auto.tempAmbienteC,
      umidita_ambiente_pct: auto.umiditaAmbientePct,
      perc_bruciatore_prevista: stima.percBruciatore,
      iot_stato: "in_attesa_dispositivo",
      registrata_id: parsed.data.registrataId ?? null,
      created_by: auth.userId,
      updated_by: auth.userId,
    })
    .select(AZIONE_COLS)
    .single();

  if (azioneErr || !azioneRow) {
    return {
      success: false,
      error: azioneErr?.message ?? "Registrazione avvio fallita.",
    };
  }

  const azione = azioneRow as AzioneRow;
  const { data: msgRows, error: msgErr } = await supabase
    .from("action_essiccatore_iot_messaggi")
    .insert(
      drafts.map((d) => ({
        azione_id: azione.id,
        canale: d.canale,
        comando: d.comando,
        payload: d.payload,
        sort_order: d.sortOrder,
        stato: "in_attesa_dispositivo",
        created_by: auth.userId,
        updated_by: auth.userId,
      }))
    )
    .select("id, azione_id, canale, comando, payload, sort_order, stato");

  if (msgErr || !msgRows?.length) {
    await supabase
      .from("action_essiccatore_azioni")
      .update({
        documento_stato: "errore",
        iot_stato: "errore",
        note: msgErr?.message ?? "Messaggi IoT non registrati.",
        updated_by: auth.userId,
      })
      .eq("id", azione.id);
    return {
      success: false,
      error: msgErr?.message ?? "I messaggi IoT non sono stati registrati.",
    };
  }

  const item = mapAzione(
    azione,
    (msgRows as MessaggioRow[]).map(mapMessaggio)
  );

  await writeAuditLog({
    entity_type: "action_essiccatore_azioni",
    entity_id: item.id,
    action: "create",
    actor_id: auth.actorUserId,
    summary: `Avvio ${ess.nome}: ${item.tempBruciatoreC}°C, ventola ${item.percVentilazione}%, bruciatore ${stima.percBruciatore}% (${stima.fonte}), ${item.kgProdotto} kg, aria ${item.tempAmbienteC}°C/${item.umiditaAmbientePct}%`,
    payload: {
      essiccatoreId: item.essiccatoreId,
      kgProdotto: kgProdotto,
      kgFonte,
      tempAmbienteC: item.tempAmbienteC,
      umiditaAmbientePct: item.umiditaAmbientePct,
      climaFonte: auto.climaFonte,
      percBruciatorePrevista: stima.percBruciatore,
      fonteStima: stima.fonte,
      vicini: stima.vicini.length,
      comandi: item.messaggi.map((m) => m.comando),
    },
  });

  return { success: true, item };
}

export async function arrestaEssiccatoreAction(
  raw: unknown
): Promise<
  { success: true; item: ActionEssiccatoreAzione } | { success: false; error: string }
> {
  const { auth } = await requireAreaAccess("action");
  const parsed = z
    .object({
      essiccatoreId: z.enum(ACTION_ESSICCATORE_IDS),
      percVentilazione: z.number().int().min(0).max(100),
      tempBruciatoreC: z.number().int().min(35).max(70).optional(),
      registrataId: z.string().uuid().optional(),
    })
    .safeParse(raw);
  if (!parsed.success) {
    return { success: false, error: "Settaggi di arresto non validi." };
  }
  const ess = ACTION_ESSICCATORI.find((e) => e.id === parsed.data.essiccatoreId);
  if (!ess) return { success: false, error: "Essiccatore non trovato." };

  const drafts = buildMessaggiArresto({
    essiccatoreId: parsed.data.essiccatoreId,
    percVentilazione: parsed.data.percVentilazione,
    consensoVentola: true,
  });
  const supabase = createServiceClient();
  const { data: azioneRow, error: azioneErr } = await supabase
    .from("action_essiccatore_azioni")
    .insert({
      essiccatore_id: parsed.data.essiccatoreId,
      azione_key: "arresto",
      versione: 1,
      documento_stato: "eseguito",
      consenso_bruciatore: false,
      temp_bruciatore_c: parsed.data.tempBruciatoreC ?? 35,
      consenso_ventola: true,
      perc_ventilazione: parsed.data.percVentilazione,
      kg_prodotto: 0,
      temp_ambiente_c: 20,
      umidita_ambiente_pct: 50,
      perc_bruciatore_prevista: 0,
      iot_stato: "in_attesa_dispositivo",
      registrata_id: parsed.data.registrataId ?? null,
      created_by: auth.userId,
      updated_by: auth.userId,
    })
    .select(AZIONE_COLS)
    .single();
  if (azioneErr || !azioneRow) {
    return {
      success: false,
      error: azioneErr?.message ?? "Registrazione arresto fallita.",
    };
  }
  const azione = azioneRow as AzioneRow;
  const { data: msgRows, error: msgErr } = await supabase
    .from("action_essiccatore_iot_messaggi")
    .insert(
      drafts.map((d) => ({
        azione_id: azione.id,
        canale: d.canale,
        comando: d.comando,
        payload: d.payload,
        sort_order: d.sortOrder,
        stato: "in_attesa_dispositivo",
        created_by: auth.userId,
        updated_by: auth.userId,
      }))
    )
    .select("id, azione_id, canale, comando, payload, sort_order, stato");
  if (msgErr || !msgRows?.length) {
    await supabase
      .from("action_essiccatore_azioni")
      .update({
        documento_stato: "errore",
        iot_stato: "errore",
        note: msgErr?.message ?? "Messaggi IoT non registrati.",
        updated_by: auth.userId,
      })
      .eq("id", azione.id);
    return {
      success: false,
      error: msgErr?.message ?? "I messaggi IoT non sono stati registrati.",
    };
  }
  const item = mapAzione(azione, (msgRows as MessaggioRow[]).map(mapMessaggio));
  await writeAuditLog({
    entity_type: "action_essiccatore_azioni",
    entity_id: item.id,
    action: "create",
    actor_id: auth.actorUserId,
    summary: `Arresto ${ess.nome}: bruciatore Off, ventola ${item.percVentilazione}%`,
    payload: {
      essiccatoreId: item.essiccatoreId,
      registrataId: parsed.data.registrataId ?? null,
      comandi: item.messaggi.map((m) => m.comando),
    },
  });
  return { success: true, item };
}
