import { NextResponse } from "next/server";
import { lookupPaesiByCap } from "@/lib/address/italy";

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const cap = (searchParams.get("cap") ?? "").trim();

  if (!/^\d{5}$/.test(cap)) {
    return NextResponse.json({ suggestions: [] });
  }

  return NextResponse.json({ suggestions: lookupPaesiByCap(cap) });
}
