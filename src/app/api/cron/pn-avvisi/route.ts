import { NextResponse } from "next/server";
import { fireDueKanbanPromemoria } from "@/lib/kanban/promemoria-fire";
import { fireDuePnAvvisi } from "@/lib/promemorie-e-note/avvisi-fire";

export const runtime = "nodejs";
export const maxDuration = 60;

/**
 * Cron Vercel: sveglie attività, promemoria e bacheche.
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
    const result = await fireDuePnAvvisi({ actorId: null, limit: 80 });
    const kanban = await fireDueKanbanPromemoria({ actorId: null, limit: 80 });
    return NextResponse.json({ ok: true, ...result, kanban });
  } catch (e) {
    console.error("[cron pn-avvisi]", e);
    return NextResponse.json(
      { error: e instanceof Error ? e.message : "Invio avvisi fallito" },
      { status: 500 }
    );
  }
}
