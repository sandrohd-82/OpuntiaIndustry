import { headers } from "next/headers";
import { createServiceClient } from "@/lib/supabase/server";
import type {
  RegistroAccessoEsito,
  RegistroAccessoEvento,
  RegistroAccessoMetodo2fa,
} from "@/lib/amministrazione/registro-accessi";

type ProfileLite = {
  id: string;
  email: string | null;
  full_name: string | null;
  first_name: string | null;
  last_name: string | null;
};

function clip(value: string, max: number): string {
  return value.trim().slice(0, max);
}

function nomeFromProfile(p: ProfileLite | null): string {
  if (!p) return "";
  const composed = [p.first_name, p.last_name].filter(Boolean).join(" ").trim();
  return clip(composed || p.full_name || "", 160);
}

async function clientMeta(): Promise<{ ip: string | null; userAgent: string | null }> {
  try {
    const h = await headers();
    const forwarded = h.get("x-forwarded-for");
    const ip =
      forwarded?.split(",")[0]?.trim() ||
      h.get("x-real-ip") ||
      h.get("cf-connecting-ip") ||
      null;
    const userAgent = h.get("user-agent");
    return {
      ip: ip ? clip(ip, 80) : null,
      userAgent: userAgent ? clip(userAgent, 400) : null,
    };
  } catch {
    return { ip: null, userAgent: null };
  }
}

async function resolveProfile(
  service: ReturnType<typeof createServiceClient>,
  userId: string | null,
  email: string
): Promise<ProfileLite | null> {
  if (userId) {
    const { data } = await service
      .from("profiles")
      .select("id, email, full_name, first_name, last_name")
      .eq("id", userId)
      .maybeSingle();
    return (data as ProfileLite | null) ?? null;
  }
  if (!email) return null;
  const { data } = await service
    .from("profiles")
    .select("id, email, full_name, first_name, last_name")
    .ilike("email", email)
    .maybeSingle();
  return (data as ProfileLite | null) ?? null;
}

/** Scrittura best-effort: non deve mai bloccare login/logout. */
export async function recordAccesso(input: {
  userId?: string | null;
  email: string;
  evento: RegistroAccessoEvento;
  esito: RegistroAccessoEsito;
  metodo2fa?: RegistroAccessoMetodo2fa | null;
  note?: string;
}): Promise<void> {
  try {
    const email = clip(input.email.toLowerCase(), 320);
    if (!email) return;
    const service = createServiceClient();
    const userId = input.userId ?? null;
    const [meta, profile] = await Promise.all([
      clientMeta(),
      resolveProfile(service, userId, email),
    ]);
    const { error } = await service.from("registro_accessi").insert({
      user_id: userId ?? profile?.id ?? null,
      email: profile?.email ? clip(profile.email.toLowerCase(), 320) : email,
      nome: nomeFromProfile(profile),
      evento: input.evento,
      esito: input.esito,
      ip: meta.ip,
      user_agent: meta.userAgent,
      metodo_2fa: input.metodo2fa ?? null,
      note: clip(input.note ?? "", 400),
      created_by: userId ?? profile?.id ?? null,
      updated_by: userId ?? profile?.id ?? null,
    });
    if (error) {
      console.error("[registro_accessi]", error.message);
    }
  } catch (e) {
    console.error("[registro_accessi]", e);
  }
}
