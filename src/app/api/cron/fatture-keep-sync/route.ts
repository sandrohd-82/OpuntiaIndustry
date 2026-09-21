import { NextResponse } from "next/server";
import { runFattureKeepSyncCronJob } from "@/app/actions/fatture-sync-keep";

export const runtime = "nodejs";
export const maxDuration = 300;

/**
 * Cron Vercel: Mantieni sincronizzato fatture emesse/ricevute (ultima → oggi).
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
    const result = await runFattureKeepSyncCronJob();
    return NextResponse.json(result);
  } catch (e) {
    console.error("[cron fatture-keep-sync]", e);
    return NextResponse.json(
      { error: e instanceof Error ? e.message : "Keep-sync fatture fallito" },
      { status: 500 }
    );
  }
}
