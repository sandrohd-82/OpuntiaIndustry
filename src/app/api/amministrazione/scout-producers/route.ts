import { NextResponse } from "next/server";
import { scoutProducersAction } from "@/app/actions/ai-scout";
import { getAuthContext, userCanAccessArea } from "@/lib/auth/session";

/** POST /api/amministrazione/scout-producers */
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

  const result = await scoutProducersAction(body);
  if (!result.success) {
    return NextResponse.json({ error: result.error }, { status: 400 });
  }
  return NextResponse.json(result);
}
