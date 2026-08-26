import { NextResponse } from "next/server";
import { invoiceAiMatchAction } from "@/app/actions/invoice-ai-match";
import { getAuthContext, userCanAccessArea } from "@/lib/auth/session";

/**
 * Alias richiesto dallo spec: POST /api/admin/invoices/ai-match
 * (stessa logica di /api/amministrazione/invoices/ai-match)
 */
export async function POST(req: Request) {
  const auth = await getAuthContext();
  if (!auth) {
    return NextResponse.json({ error: "Non autorizzato." }, { status: 401 });
  }
  if (!auth.isSecondFactorVerified) {
    return NextResponse.json(
      { error: "Completa la verifica in due passaggi." },
      { status: 403 }
    );
  }
  if (!userCanAccessArea(auth.areas, "amministrazione")) {
    return NextResponse.json({ error: "Permesso negato." }, { status: 403 });
  }

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "JSON non valido." }, { status: 400 });
  }

  const result = await invoiceAiMatchAction(body);
  if (!result.success) {
    return NextResponse.json({ error: result.error }, { status: 400 });
  }
  return NextResponse.json(result);
}
