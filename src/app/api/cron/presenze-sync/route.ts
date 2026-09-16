import { NextResponse } from "next/server";
import { todayRomeDate } from "@/lib/auth/data-scope";
import { peekFluidaEnv } from "@/lib/hr/fluida";
import { syncPresenzeGiorno } from "@/lib/hr/presenze-sync";

export const runtime = "nodejs";
export const maxDuration = 60;

/**
 * Cron Vercel: aggiorna le timbrature di oggi da Fluida.
 * Header: Authorization: Bearer $CRON_SECRET
 */
export async function GET(request: Request) {
  const secret = process.env.CRON_SECRET?.trim();
  if (!secret) {
    return NextResponse.json(
      { error: "CRON_SECRET non configurato." },
      { status: 503 }
    );
  }
  const auth = request.headers.get("authorization") || "";
  if (auth !== `Bearer ${secret}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  if (process.env.FLUIDA_SYNC_ENABLED === "false") {
    return NextResponse.json({ ok: true, skipped: true });
  }
  const env = peekFluidaEnv();
  if (!env.hasKey || !env.hasCompanyId) {
    return NextResponse.json({ ok: true, skipped: true, reason: "env" });
  }
  try {
    const result = await syncPresenzeGiorno({
      giorno: todayRomeDate(),
      actorId: null,
    });
    if (!result.success) {
      return NextResponse.json({ error: result.error }, { status: 502 });
    }
    return NextResponse.json({ ok: true, ...result });
  } catch (e) {
    console.error("[cron presenze]", e);
    return NextResponse.json(
      { error: e instanceof Error ? e.message : "Sync fallita" },
      { status: 500 }
    );
  }
}
