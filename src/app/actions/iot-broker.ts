"use server";

import { z } from "zod";
import { writeAuditLog } from "@/lib/audit";
import { requireAreaAccess } from "@/lib/areas/guard";
import {
  IOT_BROKER_ID,
  type IotBrokerImpostazioni,
  type IotProtocolloDevice,
  type IotProtocolloWeb,
  type IotStatoImpostazioni,
} from "@/lib/iot/broker";
import {
  decryptWebmailSecret,
  encryptWebmailSecret,
} from "@/lib/webmail/crypto";
import { createClient } from "@/lib/supabase/server";

const schema = z.object({
  webHost: z.string().trim().min(1).max(200),
  webPorta: z.number().int().min(1).max(65535),
  webProtocollo: z.enum(["ws", "wss"]),
  webUtente: z.string().trim().max(120),
  webPassword: z.string().max(200),
  webClientIdPrefix: z.string().trim().min(2).max(60),
  deviceHost: z.string().trim().min(1).max(200),
  devicePorta: z.number().int().min(1).max(65535),
  deviceProtocollo: z.enum(["mqtt", "mqtts"]),
  deviceUtente: z.string().trim().max(120),
  devicePassword: z.string().max(200),
  topicComando: z.string().trim().min(3).max(200),
  topicStato: z.string().trim().min(3).max(200),
  stato: z.enum(["bozza", "approvato", "chiuso"]),
});

function decifra(value: string): string {
  const raw = value.trim();
  if (!raw) return "";
  try {
    return decryptWebmailSecret(raw);
  } catch {
    return "";
  }
}

function daRiga(row: Record<string, unknown>): IotBrokerImpostazioni {
  return {
    id: String(row.id),
    versione: Number(row.versione) || 1,
    stato: String(row.stato) as IotStatoImpostazioni,
    webHost: String(row.web_host ?? ""),
    webPorta: Number(row.web_porta) || 9001,
    webProtocollo: String(row.web_protocollo) as IotProtocolloWeb,
    webUtente: String(row.web_utente ?? ""),
    webPassword: decifra(String(row.web_password_cifrata ?? "")),
    webClientIdPrefix: String(row.web_client_id_prefix ?? "opuntia-web-ui"),
    deviceHost: String(row.device_host ?? ""),
    devicePorta: Number(row.device_porta) || 443,
    deviceProtocollo: String(row.device_protocollo) as IotProtocolloDevice,
    deviceUtente: String(row.device_utente ?? ""),
    devicePassword: decifra(String(row.device_password_cifrata ?? "")),
    topicComando: String(row.topic_comando ?? ""),
    topicStato: String(row.topic_stato ?? ""),
  };
}

export async function leggiIotBrokerAction(): Promise<
  { success: true; impostazioni: IotBrokerImpostazioni } | { success: false; error: string }
> {
  await requireAreaAccess("strumenti");
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("iot_broker_impostazioni")
    .select("*")
    .eq("id", IOT_BROKER_ID)
    .is("deleted_at", null)
    .maybeSingle();
  if (error) return { success: false, error: error.message };
  if (!data) return { success: false, error: "Impostazioni broker non trovate." };
  return { success: true, impostazioni: daRiga(data as Record<string, unknown>) };
}

export async function salvaIotBrokerAction(
  raw: unknown
): Promise<
  { success: true; impostazioni: IotBrokerImpostazioni } | { success: false; error: string }
> {
  const { auth } = await requireAreaAccess("strumenti");
  const parsed = schema.safeParse(raw);
  if (!parsed.success) {
    return { success: false, error: parsed.error.issues[0]?.message ?? "Dati non validi." };
  }
  const input = parsed.data;
  const supabase = await createClient();
  const { data: attuale, error: readErr } = await supabase
    .from("iot_broker_impostazioni")
    .select("id, versione, web_password_cifrata, device_password_cifrata")
    .eq("id", IOT_BROKER_ID)
    .is("deleted_at", null)
    .maybeSingle();
  if (readErr) return { success: false, error: readErr.message };
  if (!attuale) return { success: false, error: "Impostazioni broker non trovate." };

  const webPassword = input.webPassword.trim()
    ? encryptWebmailSecret(input.webPassword)
    : String(attuale.web_password_cifrata ?? "");
  const devicePassword = input.devicePassword.trim()
    ? encryptWebmailSecret(input.devicePassword)
    : String(attuale.device_password_cifrata ?? "");
  const versione = (Number(attuale.versione) || 1) + 1;

  const { data, error } = await supabase
    .from("iot_broker_impostazioni")
    .update({
      versione,
      stato: input.stato,
      web_host: input.webHost,
      web_porta: input.webPorta,
      web_protocollo: input.webProtocollo,
      web_utente: input.webUtente,
      web_password_cifrata: webPassword,
      web_client_id_prefix: input.webClientIdPrefix,
      device_host: input.deviceHost,
      device_porta: input.devicePorta,
      device_protocollo: input.deviceProtocollo,
      device_utente: input.deviceUtente,
      device_password_cifrata: devicePassword,
      topic_comando: input.topicComando,
      topic_stato: input.topicStato,
      updated_by: auth.userId,
    })
    .eq("id", IOT_BROKER_ID)
    .select("*")
    .single();
  if (error || !data) {
    return { success: false, error: error?.message ?? "Salvataggio non riuscito." };
  }

  await writeAuditLog({
    entity_type: "iot_broker_impostazioni",
    entity_id: IOT_BROKER_ID,
    action: "update",
    actor_id: auth.userId,
    summary: `Impostazioni broker IoT aggiornate alla versione ${versione}.`,
    payload: {
      versione,
      stato: input.stato,
      webHost: input.webHost,
      webPorta: input.webPorta,
      webProtocollo: input.webProtocollo,
      deviceHost: input.deviceHost,
      devicePorta: input.devicePorta,
      deviceProtocollo: input.deviceProtocollo,
      topicComando: input.topicComando,
      topicStato: input.topicStato,
    },
  });

  return { success: true, impostazioni: daRiga(data as Record<string, unknown>) };
}
