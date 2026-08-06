import {
  getCapsByComune,
  searchComuni,
} from "italian-cap-comuni-province";
import type { PaeseSuggestion } from "@/lib/address/types";

export type { PaeseSuggestion, StreetSuggestion } from "@/lib/address/types";

type ComuneLike = {
  codiceIstat: string;
  nome: string;
  cap: string;
  siglaProvincia: string;
  nomeProvincia: string;
};

/** Ricerca paesi per nome (flusso principale). */
export function searchPaesiByName(query: string, limit = 12): PaeseSuggestion[] {
  const q = query.trim();
  if (q.length < 2) return [];

  const results = searchComuni(q, { limit }) as Array<{ item: ComuneLike }>;
  const seen = new Set<string>();
  const suggestions: PaeseSuggestion[] = [];

  for (const result of results) {
    const comune = result.item;
    if (seen.has(comune.codiceIstat)) continue;
    seen.add(comune.codiceIstat);

    let caps: string[] = [];
    try {
      const fromComune = getCapsByComune(comune.codiceIstat);
      caps = Array.isArray(fromComune)
        ? fromComune.map(String)
        : comune.cap
          ? [comune.cap]
          : [];
    } catch {
      caps = comune.cap ? [comune.cap] : [];
    }

    const primaryCap = caps[0] ?? comune.cap ?? "";
    const capHint =
      caps.length > 1
        ? ` · CAP ${caps.slice(0, 3).join(", ")}${caps.length > 3 ? "…" : ""}`
        : primaryCap
          ? ` · CAP ${primaryCap}`
          : "";

    suggestions.push({
      id: comune.codiceIstat,
      cap: primaryCap,
      caps,
      paese: comune.nome,
      citta: comune.nome,
      provincia: comune.nomeProvincia,
      siglaProvincia: comune.siglaProvincia,
      nazione: "Italia",
      label: `${comune.nome} (${comune.siglaProvincia})${capHint}`,
      kind: "comune",
      comune: comune.nome,
    });
  }

  return suggestions;
}
