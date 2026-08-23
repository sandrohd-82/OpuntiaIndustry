import { NextResponse } from "next/server";
import { createServiceClient } from "@/lib/supabase/server";

export const runtime = "nodejs";

/**
 * Webhook interno (DB trigger / cron) → stessa logica push.
 * Auth: CHAT_PUSH_WEBHOOK_SECRET o CRON_SECRET.
 */
export async function POST(req: Request) {
  const secret =
    process.env.CHAT_PUSH_WEBHOOK_SECRET || process.env.CRON_SECRET;
  const header = req.headers.get("authorization")?.replace(/^Bearer\s+/i, "");
  if (!secret || header !== secret) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const body = (await req.json().catch(() => null)) as {
    messageId?: string;
  } | null;
  if (!body?.messageId) {
    return NextResponse.json({ error: "messageId obbligatorio" }, { status: 400 });
  }

  // Delega allo stesso path interno: riusa service client + notify logic
  const admin = createServiceClient();
  const { data: msg } = await admin
    .from("messages")
    .select("id, sender_id, conversation_id, content")
    .eq("id", body.messageId)
    .maybeSingle();
  if (!msg) {
    return NextResponse.json({ error: "not_found" }, { status: 404 });
  }

  // Richiama notify con impersonation non possibile: qui solo log readiness
  // Il client mittente chiama /api/chat/notify con sessione utente.
  return NextResponse.json({
    ok: true,
    messageId: msg.id,
    note: "Usare POST /api/chat/notify autenticato dal mittente per FCM.",
  });
}
