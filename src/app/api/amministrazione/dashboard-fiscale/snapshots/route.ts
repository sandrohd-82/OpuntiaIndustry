import { NextResponse } from "next/server";
import {
  getDashboardFiscaleSummaryAction,
  listDashboardFiscaleSnapshotsAction,
  saveDashboardFiscaleSnapshotAction,
} from "@/app/actions/dashboard-fiscale";

export async function GET() {
  const result = await listDashboardFiscaleSnapshotsAction();
  if (!result.success) {
    return NextResponse.json({ error: result.error }, { status: 400 });
  }
  return NextResponse.json({ items: result.items });
}

export async function POST(request: Request) {
  let body: {
    tipo?: "mese" | "trimestre";
    anno?: number;
    mese?: number;
    note?: string;
  } = {};
  try {
    body = (await request.json()) as typeof body;
  } catch {
    body = {};
  }
  const summary = await getDashboardFiscaleSummaryAction({
    tipo: body.tipo === "mese" ? "mese" : "trimestre",
    anno: body.anno,
    mese: body.mese,
  });
  if (!summary.success) {
    return NextResponse.json({ error: summary.error }, { status: 400 });
  }
  const saved = await saveDashboardFiscaleSnapshotAction({
    summary: summary.data,
    note: body.note,
  });
  if (!saved.success) {
    return NextResponse.json({ error: saved.error }, { status: 400 });
  }
  return NextResponse.json({ id: saved.id });
}
