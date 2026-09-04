"use server";

import { writeAuditLog } from "@/lib/audit";
import { requireAreaAccess } from "@/lib/areas/guard";
import { isAdminLikeProfile } from "@/lib/auth/roles";
import { hashDeviceToken, newDeviceToken, tokenHint } from "@/lib/produzione/iot-token";
import {
  iotCommandInputSchema,
  iotDeviceUpsertSchema,
  type IotCommand,
  type IotDevice,
  type IotTelemetry,
} from "@/lib/produzione/iot";
import { createClient, createServiceClient } from "@/lib/supabase/server";

const DEVICE_COLS =
  "id, macchinario_id, device_code, name, status, last_ping, api_token_hash, api_token_hint, poll_seconds";

type DeviceRow = {
  id: string;
  macchinario_id: string;
  device_code: string;
  name: string;
  status: IotDevice["status"];
  last_ping: string | null;
  api_token_hash: string | null;
  api_token_hint: string;
  poll_seconds: number;
};

function mapDevice(row: DeviceRow): IotDevice {
  return {
    id: row.id,
    macchinarioId: row.macchinario_id,
    deviceCode: row.device_code,
    name: row.name,
    status: row.status === "ONLINE" ? "ONLINE" : "OFFLINE",
    lastPing: row.last_ping,
    apiTokenHint: row.api_token_hint ?? "",
    pollSeconds: row.poll_seconds ?? 5,
    hasToken: Boolean(row.api_token_hash),
  };
}

export async function getIotDeviceByMacchinarioAction(
  macchinarioId: string
): Promise<
  { success: true; device: IotDevice | null } | { success: false; error: string }
> {
  await requireAreaAccess("produzione");
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("iot_devices")
    .select(DEVICE_COLS)
    .eq("macchinario_id", macchinarioId)
    .is("deleted_at", null)
    .maybeSingle();
  if (error) return { success: false, error: error.message };
  return { success: true, device: data ? mapDevice(data as DeviceRow) : null };
}

export async function listIotDevicesForAreaAction(
  areaId: string
): Promise<
  { success: true; items: IotDevice[] } | { success: false; error: string }
> {
  await requireAreaAccess("produzione");
  const supabase = await createClient();
  const { data: macs, error: mErr } = await supabase
    .from("produzione_macchinari")
    .select("id")
    .eq("area_id", areaId)
    .is("deleted_at", null);
  if (mErr) return { success: false, error: mErr.message };
  const ids = ((macs ?? []) as Array<{ id: string }>).map((m) => m.id);
  if (!ids.length) return { success: true, items: [] };
  const { data, error } = await supabase
    .from("iot_devices")
    .select(DEVICE_COLS)
    .in("macchinario_id", ids)
    .is("deleted_at", null)
    .order("device_code", { ascending: true });
  if (error) return { success: false, error: error.message };
  return { success: true, items: ((data ?? []) as DeviceRow[]).map(mapDevice) };
}

export async function upsertIotDeviceAction(
  raw: unknown
): Promise<
  | { success: true; device: IotDevice; plaintextToken?: string }
  | { success: false; error: string }
> {
  const { auth } = await requireAreaAccess("produzione");
  if (!isAdminLikeProfile(auth.profile)) {
    return { success: false, error: "Solo l’amministratore può configurare l’IoT." };
  }
  const parsed = iotDeviceUpsertSchema.safeParse(raw);
  if (!parsed.success) {
    return { success: false, error: parsed.error.issues[0]?.message ?? "Dati non validi." };
  }
  const supabase = await createClient();
  const { data: mac, error: macErr } = await supabase
    .from("produzione_macchinari")
    .select("id, nome, codice")
    .eq("id", parsed.data.macchinarioId)
    .is("deleted_at", null)
    .maybeSingle();
  if (macErr || !mac) {
    return { success: false, error: macErr?.message ?? "Macchinario non trovato." };
  }
  const nome = (mac as { nome: string }).nome;
  const { data: existing } = await supabase
    .from("iot_devices")
    .select(DEVICE_COLS)
    .eq("macchinario_id", parsed.data.macchinarioId)
    .is("deleted_at", null)
    .maybeSingle();

  let plaintextToken: string | undefined;
  let tokenHash: string | null = (existing as DeviceRow | null)?.api_token_hash ?? null;
  let hint = (existing as DeviceRow | null)?.api_token_hint ?? "";
  if (!existing || parsed.data.regenerateToken || !tokenHash) {
    plaintextToken = newDeviceToken();
    tokenHash = hashDeviceToken(plaintextToken);
    hint = tokenHint(plaintextToken);
  }

  const payload = {
    macchinario_id: parsed.data.macchinarioId,
    device_code: parsed.data.deviceCode.toUpperCase(),
    name: nome,
    poll_seconds: parsed.data.pollSeconds,
    api_token_hash: tokenHash,
    api_token_hint: hint,
    updated_by: auth.userId,
  };

  const query = existing
    ? supabase
        .from("iot_devices")
        .update(payload)
        .eq("id", (existing as DeviceRow).id)
        .is("deleted_at", null)
        .select(DEVICE_COLS)
        .single()
    : supabase
        .from("iot_devices")
        .insert({ ...payload, created_by: auth.userId })
        .select(DEVICE_COLS)
        .single();

  const { data, error } = await query;
  if (error || !data) {
    if (error?.code === "23505") {
      return { success: false, error: "Questo device_code è già usato." };
    }
    return { success: false, error: error?.message ?? "Salvataggio dispositivo fallito." };
  }

  await supabase
    .from("produzione_macchinari")
    .update({
      iot_collegato: true,
      stato_iot: "spento",
      updated_by: auth.userId,
    })
    .eq("id", parsed.data.macchinarioId)
    .is("deleted_at", null);

  const device = mapDevice(data as DeviceRow);
  await writeAuditLog({
    entity_type: "iot_devices",
    entity_id: device.id,
    action: existing ? "update" : "create",
    actor_id: auth.userId,
    summary: `Configurato IoT ${device.deviceCode} per ${nome}`,
    payload: { macchinario_id: parsed.data.macchinarioId, token_ruotato: Boolean(plaintextToken) },
  });
  return { success: true, device, plaintextToken };
}

export async function disableIotDeviceAction(
  macchinarioId: string
): Promise<{ success: true } | { success: false; error: string }> {
  const { auth } = await requireAreaAccess("produzione");
  if (!isAdminLikeProfile(auth.profile)) {
    return { success: false, error: "Solo l’amministratore può disattivare l’IoT." };
  }
  const supabase = await createClient();
  await supabase
    .from("produzione_macchinari")
    .update({
      iot_collegato: false,
      stato_iot: "no_iot",
      updated_by: auth.userId,
    })
    .eq("id", macchinarioId)
    .is("deleted_at", null);
  await writeAuditLog({
    entity_type: "produzione_macchinari",
    entity_id: macchinarioId,
    action: "iot_disable",
    actor_id: auth.userId,
    summary: "Macchinario riportato a gestione manuale",
  });
  return { success: true };
}

export async function enqueueIotCommandAction(
  raw: unknown
): Promise<
  { success: true; command: IotCommand } | { success: false; error: string }
> {
  const { auth } = await requireAreaAccess("produzione");
  const parsed = iotCommandInputSchema.safeParse(raw);
  if (!parsed.success) {
    return { success: false, error: parsed.error.issues[0]?.message ?? "Comando non valido." };
  }
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("iot_commands")
    .insert({
      device_id: parsed.data.deviceId,
      command: parsed.data.command.toUpperCase(),
      created_by: auth.userId,
      updated_by: auth.userId,
    })
    .select("id, device_id, command, executed, executed_at, created_at")
    .single();
  if (error || !data) {
    return { success: false, error: error?.message ?? "Invio comando fallito." };
  }
  const row = data as {
    id: string;
    device_id: string;
    command: string;
    executed: boolean;
    executed_at: string | null;
    created_at: string;
  };
  await writeAuditLog({
    entity_type: "iot_commands",
    entity_id: row.id,
    action: "create",
    actor_id: auth.userId,
    summary: `Comando IoT ${row.command}`,
    payload: { device_id: row.device_id },
  });
  return {
    success: true,
    command: {
      id: row.id,
      deviceId: row.device_id,
      command: row.command,
      executed: row.executed,
      executedAt: row.executed_at,
      createdAt: row.created_at,
    },
  };
}

export async function enqueueIotPowerCommand(
  macchinarioId: string,
  on: boolean,
  actorId: string
): Promise<void> {
  const admin = createServiceClient();
  const { data: device } = await admin
    .from("iot_devices")
    .select("id")
    .eq("macchinario_id", macchinarioId)
    .is("deleted_at", null)
    .maybeSingle();
  if (!device) return;
  await admin.from("iot_commands").insert({
    device_id: (device as { id: string }).id,
    command: on ? "POWER_ON" : "POWER_OFF",
    created_by: actorId,
    updated_by: actorId,
  });
}

export async function listIotTelemetryAction(
  deviceId: string,
  limit = 20
): Promise<
  { success: true; items: IotTelemetry[] } | { success: false; error: string }
> {
  await requireAreaAccess("produzione");
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("iot_telemetry")
    .select("id, device_id, data, created_at")
    .eq("device_id", deviceId)
    .order("created_at", { ascending: false })
    .limit(limit);
  if (error) return { success: false, error: error.message };
  return {
    success: true,
    items: ((data ?? []) as Array<{
      id: string;
      device_id: string;
      data: Record<string, unknown>;
      created_at: string;
    }>).map((r) => ({
      id: r.id,
      deviceId: r.device_id,
      data: r.data ?? {},
      createdAt: r.created_at,
    })),
  };
}

export async function listIotCommandsAction(
  deviceId: string,
  limit = 20
): Promise<
  { success: true; items: IotCommand[] } | { success: false; error: string }
> {
  await requireAreaAccess("produzione");
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("iot_commands")
    .select("id, device_id, command, executed, executed_at, created_at")
    .eq("device_id", deviceId)
    .order("created_at", { ascending: false })
    .limit(limit);
  if (error) return { success: false, error: error.message };
  return {
    success: true,
    items: ((data ?? []) as Array<{
      id: string;
      device_id: string;
      command: string;
      executed: boolean;
      executed_at: string | null;
      created_at: string;
    }>).map((r) => ({
      id: r.id,
      deviceId: r.device_id,
      command: r.command,
      executed: r.executed,
      executedAt: r.executed_at,
      createdAt: r.created_at,
    })),
  };
}
