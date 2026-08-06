import { NextResponse } from "next/server";
import { searchPaesiByName } from "@/lib/address/italy";

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const q = (searchParams.get("q") ?? "").trim();

  if (q.length < 2) {
    return NextResponse.json({ suggestions: [] });
  }

  return NextResponse.json({ suggestions: searchPaesiByName(q) });
}
