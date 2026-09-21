import { NextResponse } from "next/server";
import { isUnrestrictedSuperadmin } from "@/lib/auth/roles";
import { getAuthContext, userCanAccessArea } from "@/lib/auth/session";
import { isConfigStato, parseProfileStatoOperativo } from "@/lib/auth/stato-operativo";
import { queryDettaglioOccupazionePosto } from "@/lib/magazzino/posto-occupazione-query";
import type { AreaSlug } from "@/types/database";

export const runtime = "nodejs";

const AREE: AreaSlug[] = [
  "magazzino",
  "strumenti",
  "amministrazione",
  "produzione",
  "commerciale",
  "action",
];

async function puoVedere(): Promise<boolean> {
  const auth = await getAuthContext();
  if (!auth) return false;
  if (isUnrestrictedSuperadmin(auth)) return true;
  if (
    auth.impersonating &&
    isConfigStato(parseProfileStatoOperativo(auth.profile.stato_operativo))
  ) {
    return true;
  }
  return AREE.some((s) => userCanAccessArea(auth.areas, s));
}

export async function GET(request: Request) {
  try {
    if (!(await puoVedere())) {
      return NextResponse.json(
        { success: false, error: "Accesso richiesto." },
        { status: 401 }
      );
    }
    const ubicazioneId =
      new URL(request.url).searchParams.get("ubicazioneId") ?? "";
    const res = await queryDettaglioOccupazionePosto(ubicazioneId);
    return NextResponse.json(res, { status: res.success ? 200 : 400 });
  } catch (err) {
    const message =
      err instanceof Error ? err.message : "Occupazione non disponibile.";
    return NextResponse.json({ success: false, error: message }, { status: 500 });
  }
}
