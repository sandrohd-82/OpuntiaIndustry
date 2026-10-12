import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { requireAreaAccess } from "@/lib/areas/guard";
import { getAuthContext } from "@/lib/auth/session";
import { createClient, createServiceClient } from "@/lib/supabase/server";
import {
  cercaLinkOspite,
  COOKIE_OSPITE_COMMERCIALISTA,
  registraAuditOspite,
} from "@/lib/amministrazione/commercialista-ospite";

type ClientLettura = Awaited<ReturnType<typeof createClient>>;

export async function requireCommercialistaLettura(): Promise<{
  ospite: boolean;
  linkId: string | null;
  userId: string | null;
  supabase: ClientLettura;
}> {
  const auth = await getAuthContext();
  if (auth) {
    await requireAreaAccess("area-fiscale");
    return {
      ospite: false,
      linkId: null,
      userId: auth.userId,
      supabase: await createClient(),
    };
  }
  const token =
    (await cookies()).get(COOKIE_OSPITE_COMMERCIALISTA)?.value ?? "";
  const link = await cercaLinkOspite(token);
  if (!link) redirect("/login");
  return {
    ospite: true,
    linkId: link.id,
    userId: null,
    supabase: createServiceClient() as ClientLettura,
  };
}

/** Il link non può modificare periodi o sequenze. */
export async function bloccaScritturaOspite(operazione: string): Promise<void> {
  const auth = await getAuthContext();
  if (auth) return;
  const token =
    (await cookies()).get(COOKIE_OSPITE_COMMERCIALISTA)?.value ?? "";
  const link = token ? await cercaLinkOspite(token) : null;
  if (link) {
    await registraAuditOspite({
      entityId: link.id,
      action: "status_change",
      summary: `Link commercialista: operazione non consentita (${operazione})`,
      payload: { operazione, percorso: "/app/area-fiscale/commercialista" },
    });
  }
  redirect("/login?motivo=link");
}

export async function sessioneOspiteCommercialista(): Promise<{
  id: string;
  expiresAt: string;
} | null> {
  const auth = await getAuthContext();
  if (auth) return null;
  const token =
    (await cookies()).get(COOKIE_OSPITE_COMMERCIALISTA)?.value ?? "";
  if (!token) return null;
  const link = await cercaLinkOspite(token);
  if (!link) return null;
  return { id: link.id, expiresAt: link.expires_at };
}
