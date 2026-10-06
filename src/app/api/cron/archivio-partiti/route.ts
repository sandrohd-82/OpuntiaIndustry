import { NextResponse } from "next/server";
import { archiviaPartitiScaduti } from "@/lib/amministrazione/ciclo-ordine-avanzamento";

export const runtime = "nodejs";
export const maxDuration = 60;

/**
 * Cron Vercel: sposta in archivio gli ordini e le campionature partiti da più di 30 giorni.
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
  try {
    const result = await archiviaPartitiScaduti();
    return NextResponse.json({ ok: true, ...result });
  } catch (e) {
    console.error("[cron archivio-partiti]", e);
    return NextResponse.json(
      { error: e instanceof Error ? e.message : "Archivio partiti fallito" },
      { status: 500 }
    );
  }
}
