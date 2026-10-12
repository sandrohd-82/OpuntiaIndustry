/**
 * Link ospite della sola elaborazione Commercialista (un registro o il trimestre).
 * Il codice in chiaro non viene salvato: in tabella resta l'impronta.
 * Questo file non importa next/headers, così il middleware può usarlo.
 */

export const COOKIE_OSPITE_COMMERCIALISTA = "oi_commercialista_ospite";
export const PERCORSO_OSPITE_COMMERCIALISTA =
  "/app/area-fiscale/commercialista/elabora";
export const GIORNI_LINK_COMMERCIALISTA = 3;
export const ENTITY_LINK_SCONOSCIUTO = "00000000-0000-0000-0000-000000000000";

export const REGISTRI_LINK_OSPITE = [
  "emessa",
  "ricevuta",
  "ddt_emesso",
  "ddt_ricevuto",
  "nota_emessa",
  "nota_ricevuta",
] as const;

export type RegistroLinkOspite = (typeof REGISTRI_LINK_OSPITE)[number];
export type AmbitoLinkOspite = "registro" | "trimestre";

export type LinkOspiteRiga = {
  id: string;
  expires_at: string;
  ambito: AmbitoLinkOspite;
  registro: RegistroLinkOspite | null;
  anno: number;
  trimestre: number;
};

export function generaTokenOspite(): string {
  const bytes = new Uint8Array(32);
  crypto.getRandomValues(bytes);
  let raw = "";
  for (const byte of bytes) raw += String.fromCharCode(byte);
  return btoa(raw).replaceAll("+", "-").replaceAll("/", "_").replaceAll("=", "");
}

export async function hashTokenOspite(token: string): Promise<string> {
  const data = new TextEncoder().encode(token);
  const buf = await crypto.subtle.digest("SHA-256", data);
  return [...new Uint8Array(buf)]
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

export function scadenzaLinkOspite(da: Date = new Date()): string {
  return new Date(
    da.getTime() + GIORNI_LINK_COMMERCIALISTA * 24 * 60 * 60 * 1000
  ).toISOString();
}

export function opzioniCookieOspite(expiresAt: string) {
  const restano = Math.floor(
    (new Date(expiresAt).getTime() - Date.now()) / 1000
  );
  return {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax" as const,
    path: "/",
    maxAge: Math.max(60, restano),
  };
}

function chiaveServizio(): { url: string; key: string } | null {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) return null;
  return { url, key };
}

export async function cercaLinkOspite(
  token: string
): Promise<LinkOspiteRiga | null> {
  const pulito = token.trim();
  if (pulito.length < 20 || pulito.length > 120) return null;
  if (!/^[A-Za-z0-9_-]+$/.test(pulito)) return null;
  const env = chiaveServizio();
  if (!env) return null;
  const hash = await hashTokenOspite(pulito);
  const res = await fetch(
    `${env.url}/rest/v1/commercialista_link_ospite?token_hash=eq.${hash}&select=id,expires_at,revoked_at,ambito,registro,anno,trimestre&limit=1`,
    {
      headers: {
        apikey: env.key,
        Authorization: `Bearer ${env.key}`,
      },
      cache: "no-store",
    }
  );
  if (!res.ok) return null;
  const rows = (await res.json()) as Array<{
    id?: string;
    expires_at?: string;
    revoked_at?: string | null;
    ambito?: string | null;
    registro?: string | null;
    anno?: number | null;
    trimestre?: number | null;
  }>;
  const row = rows[0];
  if (!row?.id || !row.expires_at || row.revoked_at) return null;
  if (new Date(row.expires_at).getTime() <= Date.now()) return null;
  const ambito = row.ambito === "registro" || row.ambito === "trimestre" ? row.ambito : null;
  const anno = Number(row.anno);
  const trimestre = Number(row.trimestre);
  if (!ambito || !Number.isInteger(anno) || !Number.isInteger(trimestre)) return null;
  if (trimestre < 1 || trimestre > 4) return null;
  const registro = REGISTRI_LINK_OSPITE.find((kind) => kind === row.registro) ?? null;
  if (ambito === "trimestre" && registro) return null;
  if (ambito === "registro" && !registro) return null;
  return {
    id: row.id,
    expires_at: row.expires_at,
    ambito,
    registro,
    anno,
    trimestre,
  };
}

export function linkConsenteRegistro(
  link: LinkOspiteRiga,
  kind: string,
  anno: number,
  trimestre: number
): boolean {
  if (link.anno !== anno || link.trimestre !== trimestre) return false;
  if (link.ambito === "trimestre") return true;
  return link.registro === kind;
}

export async function registraAuditOspite(input: {
  entityId: string;
  action: "create" | "update" | "status_change";
  summary: string;
  actorId?: string | null;
  payload: Record<string, unknown>;
}): Promise<void> {
  const env = chiaveServizio();
  if (!env) return;
  const body: Record<string, unknown> = {
    entity_type: "commercialista_link_ospite",
    entity_id: input.entityId,
    action: input.action,
    summary: input.summary.slice(0, 500),
    payload: input.payload,
  };
  if (input.actorId) body.actor_id = input.actorId;
  try {
    await fetch(`${env.url}/rest/v1/audit_log`, {
      method: "POST",
      headers: {
        apikey: env.key,
        Authorization: `Bearer ${env.key}`,
        "Content-Type": "application/json",
        Prefer: "return=minimal",
      },
      body: JSON.stringify(body),
      cache: "no-store",
    });
  } catch (error) {
    console.error("[commercialista_link]", error);
  }
}
