import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { requireAreaAccess } from "@/lib/areas/guard";
import { getAuthContext } from "@/lib/auth/session";
import { createClient, createServiceClient } from "@/lib/supabase/server";
import {
  cercaLinkOspite,
  COOKIE_OSPITE_COMMERCIALISTA,
  linkConsenteRegistro,
  PERCORSO_OSPITE_COMMERCIALISTA,
  registraAuditOspite,
  type LinkOspiteRiga,
} from "@/lib/amministrazione/commercialista-ospite";

type ClientLettura = Awaited<ReturnType<typeof createClient>>;

export async function requireCommercialistaLettura(): Promise<{
  ospite: boolean;
  linkId: string | null;
  link: LinkOspiteRiga | null;
  userId: string | null;
  supabase: ClientLettura;
}> {
  const auth = await getAuthContext();
  if (auth) {
    await requireAreaAccess("area-fiscale");
    return {
      ospite: false,
      linkId: null,
      link: null,
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
    link,
    userId: null,
    supabase: createServiceClient() as ClientLettura,
  };
}

/** Il link non apre il riepilogo né un'elaborazione diversa da quella indicata. */
export async function negaOspiteFuoriElaborazione(input: {
  kind?: string;
  anno?: number;
  trimestre?: number;
  operazione: string;
  soloTrimestre?: boolean;
}): Promise<void> {
  const auth = await getAuthContext();
  if (auth) return;
  const token =
    (await cookies()).get(COOKIE_OSPITE_COMMERCIALISTA)?.value ?? "";
  const link = token ? await cercaLinkOspite(token) : null;
  const stessoPeriodo =
    Boolean(link) &&
    input.anno != null &&
    input.trimestre != null &&
    link!.anno === input.anno &&
    link!.trimestre === input.trimestre;
  const consentito = Boolean(
    link &&
      stessoPeriodo &&
      (input.soloTrimestre
        ? link.ambito === "trimestre"
        : input.kind &&
          linkConsenteRegistro(link, input.kind, input.anno!, input.trimestre!))
  );
  if (consentito) return;
  if (link) {
    await registraAuditOspite({
      entityId: link.id,
      action: "status_change",
      summary: `Link commercialista: elaborazione non consentita (${input.operazione})`,
      payload: {
        operazione: input.operazione,
        percorso: PERCORSO_OSPITE_COMMERCIALISTA,
        kind: input.kind ?? null,
        anno: input.anno ?? null,
        trimestre: input.trimestre ?? null,
      },
    });
  }
  redirect("/login?motivo=link");
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

export async function sessioneOspiteCommercialista(): Promise<LinkOspiteRiga | null> {
  const auth = await getAuthContext();
  if (auth) return null;
  const token =
    (await cookies()).get(COOKIE_OSPITE_COMMERCIALISTA)?.value ?? "";
  if (!token) return null;
  return cercaLinkOspite(token);
}
