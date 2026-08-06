import {
  getComuniByCAP,
  getComuniByProvincia,
  isValidCAP,
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

function toSuggestion(
  comune: ComuneLike,
  requestedCap: string,
  exact: boolean
): PaeseSuggestion {
  const officialDifferent =
    !exact && comune.cap && comune.cap !== requestedCap
      ? ` · CAP ufficiale ${comune.cap}`
      : "";

  return {
    id: `${comune.codiceIstat}-${comune.cap}-${exact ? "exact" : "near"}`,
    cap: requestedCap,
    paese: comune.nome,
    citta: comune.nome,
    provincia: comune.nomeProvincia,
    siglaProvincia: comune.siglaProvincia,
    nazione: "Italia",
    label: `${comune.nome} (${comune.siglaProvincia})${officialDifferent}`,
  };
}

/**
 * Suggerimenti paese per CAP:
 * - match esatti sul CAP
 * - comuni della stessa provincia con CAP nello stesso gruppo (primi 4 digit),
 *   così casi come 52035 mostrano anche Sansepolcro (52037) e altri vicini
 */
export function lookupPaesiByCap(cap: string, query = ""): PaeseSuggestion[] {
  const normalized = cap.trim();
  if (!isValidCAP(normalized)) return [];

  const exact = getComuniByCAP(normalized);
  const exactList = Array.isArray(exact) ? exact : exact ? [exact] : [];
  const suggestions: PaeseSuggestion[] = [];
  const seen = new Set<string>();

  function push(comune: ComuneLike, isExact: boolean) {
    const key = comune.codiceIstat;
    if (seen.has(key)) return;
    seen.add(key);
    suggestions.push(toSuggestion(comune, normalized, isExact));
  }

  for (const comune of exactList) push(comune, true);

  const seed = exactList[0];
  if (seed) {
    const prefix = normalized.slice(0, 4);
    const nearby = getComuniByProvincia(seed.siglaProvincia) as ComuneLike[];
    for (const comune of nearby) {
      if (String(comune.cap).startsWith(prefix)) {
        push(comune, comune.cap === normalized);
      }
    }
  }

  const q = query.trim().toLowerCase();
  if (!q) {
    return suggestions.sort((a, b) => a.paese.localeCompare(b.paese, "it"));
  }

  // Se l'utente digita nella città, amplia con ricerca per nome filtrata sulla provincia
  const provinceFilter = seed?.siglaProvincia;
  const searched = searchComuni(q, { limit: 20 }) as Array<{
    item: ComuneLike;
  }>;

  for (const result of searched) {
    const comune = result.item;
    if (provinceFilter && comune.siglaProvincia !== provinceFilter) continue;
    push(comune, comune.cap === normalized);
  }

  return suggestions
    .filter((s) => s.paese.toLowerCase().includes(q))
    .sort((a, b) => a.paese.localeCompare(b.paese, "it"));
}
