import { NextResponse } from "next/server";
import { getDashboardFiscaleSummaryAction } from "@/app/actions/dashboard-fiscale";

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const tipo =
    searchParams.get("tipo") === "mese" ? "mese" : ("trimestre" as const);
  const anno = Number(searchParams.get("anno") || "") || undefined;
  const mese = Number(searchParams.get("mese") || "") || undefined;
  const result = await getDashboardFiscaleSummaryAction({ tipo, anno, mese });
  if (!result.success) {
    return NextResponse.json({ error: result.error }, { status: 400 });
  }
  return NextResponse.json(result.data);
}
