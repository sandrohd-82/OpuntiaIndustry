import { NextResponse } from "next/server";
import { createServiceClient } from "@/lib/supabase/server";
import { syncAllWebmailAccounts } from "@/lib/webmail/sync";

export const runtime = "nodejs";
export const maxDuration = 60;

/**
 * Cron sync Webmail (Vercel Cron / scheduler esterno).
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
  if (process.env.WEBMAIL_SYNC_ENABLED === "false") {
    return NextResponse.json({ ok: true, skipped: true });
  }

  try {
    const supabase = createServiceClient();
    const result = await syncAllWebmailAccounts(supabase);
    return NextResponse.json({ ok: true, ...result });
  } catch (e) {
    console.error("[cron webmail]", e);
    return NextResponse.json(
      { error: e instanceof Error ? e.message : "Sync fallita" },
      { status: 500 }
    );
  }
}
