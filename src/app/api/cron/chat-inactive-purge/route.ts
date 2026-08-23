import { NextResponse } from "next/server";
import { createServiceClient } from "@/lib/supabase/server";

export const runtime = "nodejs";
export const maxDuration = 60;

/**
 * Cron: purge conversazioni inactive >= 7 giorni.
 * Auth: CRON_SECRET (Authorization: Bearer …)
 */
export async function GET(req: Request) {
  const secret = process.env.CRON_SECRET;
  const header = req.headers.get("authorization")?.replace(/^Bearer\s+/i, "");
  if (!secret || header !== secret) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const admin = createServiceClient();
  const { data, error } = await admin.rpc("purge_inactive_chats", {
    p_days: 7,
  });
  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
  void admin.rpc("purge_expired_listing_chats");
  return NextResponse.json({ ok: true, purged: data ?? 0 });
}
