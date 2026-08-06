import { getComuniByCAP, isValidCAP } from "italian-cap-comuni-province";
import type { PaeseSuggestion } from "@/lib/address/types";

export type { PaeseSuggestion, StreetSuggestion } from "@/lib/address/types";

export function lookupPaesiByCap(cap: string): PaeseSuggestion[] {
  const normalized = cap.trim();
  if (!isValidCAP(normalized)) return [];

  const comuni = getComuniByCAP(normalized);
  if (!Array.isArray(comuni) || comuni.length === 0) return [];

  const seen = new Set<string>();
  const suggestions: PaeseSuggestion[] = [];

  for (const comune of comuni) {
    const key = `${comune.codiceIstat}-${comune.cap}`;
    if (seen.has(key)) continue;
    seen.add(key);

    suggestions.push({
      id: key,
      cap: comune.cap,
      paese: comune.nome,
      citta: comune.nome,
      provincia: comune.nomeProvincia,
      siglaProvincia: comune.siglaProvincia,
      nazione: "Italia",
      label: `${comune.nome} (${comune.siglaProvincia}) · ${comune.cap}`,
    });
  }

  return suggestions;
}
