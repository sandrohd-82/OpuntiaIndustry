import { NextResponse } from "next/server";
import { searchFrazioniByName } from "@/lib/address/frazioni";
import { searchPaesiByName } from "@/lib/address/italy";
import type { PaeseSuggestion } from "@/lib/address/types";

function dedupe(suggestions: PaeseSuggestion[]): PaeseSuggestion[] {
  const seen = new Set<string>();
  const out: PaeseSuggestion[] = [];

  for (const item of suggestions) {
    const key = `${item.paese}|${item.comune ?? ""}|${item.provincia}|${item.cap}`
      .toLocaleLowerCase("it-IT")
      .normalize("NFD")
      .replace(/\p{M}/gu, "");
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(item);
  }

  return out;
}

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const q = (searchParams.get("q") ?? "").trim();

  if (q.length < 2) {
    return NextResponse.json({ suggestions: [] });
  }

  const [comuni, frazioni] = await Promise.all([
    Promise.resolve(searchPaesiByName(q, 10)),
    searchFrazioniByName(q, 12),
  ]);

  // Frazioni prima dei soli comuni omonimi meno rilevanti, poi comuni ISTAT
  const merged = dedupe([
    ...frazioni.filter((f) => f.kind === "frazione"),
    ...comuni,
    ...frazioni.filter((f) => f.kind !== "frazione"),
  ]).slice(0, 16);

  return NextResponse.json({ suggestions: merged });
}
