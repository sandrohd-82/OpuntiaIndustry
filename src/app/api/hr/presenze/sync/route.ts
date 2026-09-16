import { NextResponse } from "next/server";
import { isAdminLikeProfile, isUnrestrictedSuperadmin } from "@/lib/auth/roles";
import { getAuthContext, userCanAccessArea } from "@/lib/auth/session";
import { todayRomeDate } from "@/lib/auth/data-scope";
import { syncPresenzeGiorno } from "@/lib/hr/presenze-sync";

export const runtime = "nodejs";
export const maxDuration = 60;

function cronAuthorized(request: Request): boolean {
  const secret = process.env.CRON_SECRET?.trim();
  if (!secret) return false;
  const auth = request.headers.get("authorization") || "";
  return auth === `Bearer ${secret}`;
}

/**
 * Sync timbrature del giorno da Fluida → dipendenti_presenze.
 * Autenticazione: sessione admin/HR oppure Authorization: Bearer CRON_SECRET.
 */
export async function POST(request: Request) {
  const url = new URL(request.url);
  const giorno = url.searchParams.get("giorno") || todayRomeDate();
  const viaCron = cronAuthorized(request);

  if (!viaCron) {
    const auth = await getAuthContext();
    if (!auth) {
      return NextResponse.json({ error: "Non autenticato." }, { status: 401 });
    }
    const allowed =
      isUnrestrictedSuperadmin(auth) ||
      isAdminLikeProfile(auth.profile) ||
      userCanAccessArea(auth.areas, "amministrazione") ||
      userCanAccessArea(auth.areas, "hr");
    if (!allowed) {
      return NextResponse.json({ error: "Non autorizzato." }, { status: 403 });
    }
    if (!isAdminLikeProfile(auth.profile) && !isUnrestrictedSuperadmin(auth)) {
      return NextResponse.json(
        { error: "Solo amministratore può sincronizzare." },
        { status: 403 }
      );
    }
    const result = await syncPresenzeGiorno({
      giorno,
      actorId: auth.userId,
    });
    if (!result.success) {
      return NextResponse.json({ error: result.error }, { status: 502 });
    }
    return NextResponse.json({ ok: true, ...result });
  }

  const result = await syncPresenzeGiorno({ giorno, actorId: null });
  if (!result.success) {
    return NextResponse.json({ error: result.error }, { status: 502 });
  }
  return NextResponse.json({ ok: true, ...result });
}

export async function GET(request: Request) {
  return POST(request);
}
