import { NextResponse } from "next/server";
import { getDashboardFiscaleScadenzarioAction } from "@/app/actions/dashboard-fiscale";

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const dal = searchParams.get("dal") ?? undefined;
  const al = searchParams.get("al") ?? undefined;
  const result = await getDashboardFiscaleScadenzarioAction({ dal, al });
  if (!result.success) {
    return NextResponse.json({ error: result.error }, { status: 400 });
  }
  return NextResponse.json({ scadenze: result.scadenze });
}
