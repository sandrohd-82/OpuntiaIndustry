import { NextResponse } from "next/server";
import { markDocumentazioniScadute } from "@/lib/amministrazione/documentazioni-scadute";
import { createServiceClient } from "@/lib/supabase/server";

export const runtime = "nodejs";
export const maxDuration = 60;

/**
 * Cron Vercel: marca Scaduto le documentazioni con data scadenza superata.
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
    const result = await markDocumentazioniScadute(createServiceClient(), null);
    if (!result.ok) {
      return NextResponse.json({ error: result.error }, { status: 500 });
    }
    return NextResponse.json({ ok: true, marked: result.marked });
  } catch (e) {
    console.error("[cron documentazioni-scadute]", e);
    return NextResponse.json(
      { error: e instanceof Error ? e.message : "Marcatura scaduti fallita" },
      { status: 500 }
    );
  }
}
