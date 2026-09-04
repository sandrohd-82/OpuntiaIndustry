import { NextResponse } from "next/server";
import { authenticateIotDevice, readDeviceAuth } from "@/lib/produzione/iot-device-auth";
import { createServiceClient } from "@/lib/supabase/server";

export const runtime = "nodejs";

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
  const data =
    body.data && typeof body.data === "object" && !Array.isArray(body.data)
      ? (body.data as Record<string, unknown>)
      : {};
  const admin = createServiceClient();
  const now = new Date().toISOString();
  const { error } = await admin.from("iot_telemetry").insert({
    device_id: device.id,
    data,
  });
  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
  await admin
    .from("iot_devices")
    .update({ status: "ONLINE", last_ping: now })
    .eq("id", device.id);

  const on =
    data.on === true ||
    data.acceso === true ||
    data.stato === "acceso" ||
    data.stato === "on";
  const off =
    data.on === false ||
    data.acceso === false ||
    data.stato === "spento" ||
    data.stato === "off";
  if (on || off) {
    await admin
      .from("produzione_macchinari")
      .update({
        stato_iot: on ? "acceso" : "spento",
        stato_at: now,
      })
      .eq("id", device.macchinarioId)
      .is("deleted_at", null);
  }

  return NextResponse.json({ ok: true, device_code: device.deviceCode });
}
