import { createHash, randomBytes } from "crypto";

export function hashDeviceToken(token: string): string {
  const pepper =
    process.env.IOT_TOKEN_PEPPER ?? process.env.SUPABASE_SERVICE_ROLE_KEY ?? "";
  return createHash("sha256").update(`${pepper}:${token}`).digest("hex");
}

export function newDeviceToken(): string {
  return `iot_${randomBytes(24).toString("hex")}`;
}

export function tokenHint(token: string): string {
  return token.slice(-4);
}
