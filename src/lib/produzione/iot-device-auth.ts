import { hashDeviceToken } from "@/lib/produzione/iot-token";
import { createServiceClient } from "@/lib/supabase/server";

export type AuthedIotDevice = {
  id: string;
  macchinarioId: string;
  deviceCode: string;
  pollSeconds: number;
};

export async function authenticateIotDevice(
  deviceCode: string,
  token: string
): Promise<AuthedIotDevice | null> {
  if (!deviceCode.trim() || !token.trim()) return null;
  const admin = createServiceClient();
  const { data } = await admin
    .from("iot_devices")
    .select("id, macchinario_id, device_code, api_token_hash, poll_seconds")
    .ilike("device_code", deviceCode.trim())
    .is("deleted_at", null)
    .maybeSingle();
  if (!data) return null;
  const row = data as {
    id: string;
    macchinario_id: string;
    device_code: string;
    api_token_hash: string | null;
    poll_seconds: number;
  };
  if (!row.api_token_hash || row.api_token_hash !== hashDeviceToken(token)) {
    return null;
  }
  return {
    id: row.id,
    macchinarioId: row.macchinario_id,
    deviceCode: row.device_code,
    pollSeconds: row.poll_seconds ?? 5,
  };
}

export function readDeviceAuth(req: Request, body?: Record<string, unknown>) {
  const headerCode = req.headers.get("x-device-code") ?? "";
  const headerToken = req.headers.get("x-device-token") ?? "";
  const deviceCode = String(body?.device_code ?? body?.deviceCode ?? headerCode);
  const token = String(body?.token ?? body?.api_token ?? headerToken);
  return { deviceCode, token };
}
