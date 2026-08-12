import { NextResponse } from "next/server";
import { createAndSendInvoiceAction } from "@/app/actions/fattura-emissione";
import { getAuthContext, userCanAccessArea } from "@/lib/auth/session";

/**
 * POST /api/invoices/create-and-send
 * Crea la fattura su Fatture in Cloud, invia SDI (+ mail cortesia opzionale),
 * salva in fatture_emesse / fic_invoices con audit ISO 9001.
 */
export async function POST(request: Request) {
  const auth = await getAuthContext();
  if (!auth) {
    return NextResponse.json(
      { success: false, error: "Devi accedere all’app prima." },
      { status: 401 }
    );
  }
  if (!auth.isSecondFactorVerified) {
    return NextResponse.json(
      { success: false, error: "Completa la verifica in due passaggi." },
      { status: 403 }
    );
  }
  if (!userCanAccessArea(auth.areas, "amministrazione")) {
    return NextResponse.json(
      { success: false, error: "Non hai permesso per Amministrazione." },
      { status: 403 }
    );
  }

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json(
      { success: false, error: "JSON non valido." },
      { status: 400 }
    );
  }

  const result = await createAndSendInvoiceAction(body);
  return NextResponse.json(result, {
    status: result.success ? 200 : 400,
  });
}
