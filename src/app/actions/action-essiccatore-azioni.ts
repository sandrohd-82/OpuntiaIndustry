"use server";

import { writeAuditLog } from "@/lib/audit";
import {
  avvioEssiccatoreInputSchema,
  buildMessaggiAvvio,
  type ActionEssiccatoreAzione,
  type ActionEssiccatoreIotMessaggio,
  type IotCanaleAvvio,
  type IotStatoMessaggio,
} from "@/lib/action/azioni-immediate";
import { ACTION_ESSICCATORI } from "@/lib/action/essiccatori";
import { requireAreaAccess } from "@/lib/areas/guard";
import { createServiceClient } from "@/lib/supabase/server";

const AZIONE_COLS =
  "id, essiccatore_id, azione_key, versione, documento_stato, consenso_bruciatore, perc_bruciatore, consenso_ventola, perc_ventilazione, iot_stato, created_at";

type AzioneRow = {
  id: string;
  essiccatore_id: string;
  azione_key: "avvio";
  versione: number;
  documento_stato: ActionEssiccatoreAzione["documentoStato"];
  consenso_bruciatore: boolean;
  perc_bruciatore: number;
  consenso_ventola: boolean;
  perc_ventilazione: number;
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
    percBruciatore: row.perc_bruciatore,
    consensoVentola: row.consenso_ventola,
    percVentilazione: row.perc_ventilazione,
    iotStato: row.iot_stato,
    createdAt: row.created_at,
    messaggi: [...messaggi].sort((a, b) => a.sortOrder - b.sortOrder),
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

  const drafts = buildMessaggiAvvio(parsed.data);
  const supabase = createServiceClient();

  const { data: azioneRow, error: azioneErr } = await supabase
    .from("action_essiccatore_azioni")
    .insert({
      essiccatore_id: parsed.data.essiccatoreId,
      azione_key: "avvio",
      versione: 1,
      documento_stato: "eseguito",
      consenso_bruciatore: parsed.data.consensoBruciatore,
      perc_bruciatore: parsed.data.percBruciatore,
      consenso_ventola: parsed.data.consensoVentola,
      perc_ventilazione: parsed.data.percVentilazione,
      iot_stato: "in_attesa_dispositivo",
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
      error: msgErr?.message ?? "I 4 messaggi IoT non sono stati registrati.",
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
    summary: `Avvio ${ess.nome}: bruciatore ${item.percBruciatore}%, ventilazione ${item.percVentilazione}%`,
    payload: {
      essiccatoreId: item.essiccatoreId,
      azioneKey: item.azioneKey,
      consensoBruciatore: item.consensoBruciatore,
      percBruciatore: item.percBruciatore,
      consensoVentola: item.consensoVentola,
      percVentilazione: item.percVentilazione,
      comandi: item.messaggi.map((m) => m.comando),
      iotStato: item.iotStato,
    },
  });

  return { success: true, item };
}
