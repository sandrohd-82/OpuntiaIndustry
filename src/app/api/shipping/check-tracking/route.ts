import { NextResponse } from "next/server";
import { checkShippingTrackingAction } from "@/app/actions/shipping-tracking";

/**
 * Check tracking spedizione (auto o force).
 * POST JSON: { trackingId: uuid, force?: boolean, manualStatus?: string }
 */
export async function POST(request: Request) {
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "JSON non valido" }, { status: 400 });
  }

  const result = await checkShippingTrackingAction(body);
  if (!result.success) {
    return NextResponse.json({ error: result.error }, { status: 400 });
  }
  return NextResponse.json({
    item: result.item,
    logs: result.logs,
    checkNote: result.checkNote,
    skipped: result.skipped,
    ultimoAggiornamentoLabel: result.ultimoAggiornamentoLabel,
  });
}
