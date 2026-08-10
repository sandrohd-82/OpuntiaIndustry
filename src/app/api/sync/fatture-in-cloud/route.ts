import { NextResponse } from "next/server";
import { syncFattureInCloudAction } from "@/app/actions/fic-invoices";
import { getAuthContext, userCanAccessArea } from "@/lib/auth/session";

/**
 * POST /api/sync/fatture-in-cloud
 * Avvia sync differenziale (solo utenti con area Amministrazione).
 */
export async function POST() {
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

  const result = await syncFattureInCloudAction();
  return NextResponse.json(result, {
    status: result.success ? 200 : 400,
  });
}
