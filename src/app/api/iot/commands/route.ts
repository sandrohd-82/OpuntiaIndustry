import { NextResponse } from "next/server";
import { authenticateIotDevice, readDeviceAuth } from "@/lib/produzione/iot-device-auth";
import { createServiceClient } from "@/lib/supabase/server";

export const runtime = "nodejs";

export async function GET(req: Request) {
  const url = new URL(req.url);
  const { deviceCode, token } = readDeviceAuth(req, {
    device_code: url.searchParams.get("device_code") ?? "",
    token: url.searchParams.get("token") ?? "",
  });
  const device = await authenticateIotDevice(deviceCode, token);
  if (!device) {
    return NextResponse.json({ error: "Dispositivo non autorizzato" }, { status: 401 });
  }
  const admin = createServiceClient();
  const now = new Date().toISOString();
  await admin
    .from("iot_devices")
    .update({ status: "ONLINE", last_ping: now })
    .eq("id", device.id);
  const { data, error } = await admin
    .from("iot_commands")
    .select("id, command, created_at")
    .eq("device_id", device.id)
    .eq("executed", false)
    .order("created_at", { ascending: true })
    .limit(20);
  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
  return NextResponse.json({
    ok: true,
    poll_seconds: device.pollSeconds,
    commands: data ?? [],
  });
}

export async function POST(req: Request) {
  let body: Record<string, unknown>;
  try {
    body = (await req.json()) as Record<string, unknown>;
  } catch {
    return NextResponse.json({ error: "Body non valido" }, { status: 400 });
  }
  const { deviceCode, token } = readDeviceAuth(req, body);
  const device = await authenticateIotDevice(deviceCode, token);
  if (!device) {
    return NextResponse.json({ error: "Dispositivo non autorizzato" }, { status: 401 });
  }
  const commandId = String(body.command_id ?? body.id ?? "");
  if (!commandId) {
    return NextResponse.json({ error: "command_id obbligatorio" }, { status: 400 });
  }
  const admin = createServiceClient();
  const now = new Date().toISOString();
  const { data, error } = await admin
    .from("iot_commands")
    .update({ executed: true, executed_at: now })
    .eq("id", commandId)
    .eq("device_id", device.id)
    .eq("executed", false)
    .select("id, command")
    .maybeSingle();
  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
  if (!data) {
    return NextResponse.json({ error: "Comando non trovato o già eseguito" }, { status: 404 });
  }
  const cmd = (data as { command: string }).command;
  if (cmd === "POWER_ON" || cmd === "POWER_OFF") {
    await admin
      .from("produzione_macchinari")
      .update({
        stato_iot: cmd === "POWER_ON" ? "acceso" : "spento",
        stato_at: now,
      })
      .eq("id", device.macchinarioId)
      .is("deleted_at", null);
  }
  return NextResponse.json({ ok: true, command_id: commandId });
}
