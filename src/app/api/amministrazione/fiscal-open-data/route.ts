import { NextResponse } from "next/server";
import {
  listFiscalOpenDataCacheAction,
  refreshFiscalOpenDataPlaceholderAction,
} from "@/app/actions/fiscal-profile";

export async function GET() {
  const result = await listFiscalOpenDataCacheAction();
  if (!result.success) {
    return NextResponse.json({ error: result.error }, { status: 400 });
  }
  return NextResponse.json({ sources: result.sources });
}

export async function POST() {
  const result = await refreshFiscalOpenDataPlaceholderAction();
  if (!result.success) {
    return NextResponse.json({ error: result.error }, { status: 400 });
  }
  return NextResponse.json({ ok: true });
}
