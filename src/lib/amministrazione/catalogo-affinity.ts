/**
 * Affinità catalogo lato client — indice per token + scoring leggero.
 * Evita di normalizzare/scorrere l’intero catalogo a ogni Cerca.
 */

export type LocalCatalogVoce = {
  kind: "servizio" | "prodotto" | "materia" | "contributo";
  id: string;
  codice: string;
  nome: string;
};

type IndexedVoce = LocalCatalogVoce & { hay: string };

/** Normalizza per confronto: minuscolo, no diacritici, punteggiatura → spazio. */
export function normalizeAffinityText(raw: string): string {
  return (raw ?? "")
    .normalize("NFD")
    .replace(/\p{M}/gu, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function significantTokensFromNorm(norm: string): string[] {
  return norm
    .split(" ")
    .filter((t) => t.length >= 3 && !/^\d+([.,]\d+)?$/.test(t));
}

/** Levenshtein con early-exit. */
function levenshteinBounded(a: string, b: string, maxDist: number): number {
  if (a === b) return 0;
  if (!a.length) return b.length > maxDist ? maxDist + 1 : b.length;
  if (!b.length) return a.length > maxDist ? maxDist + 1 : a.length;
  if (Math.abs(a.length - b.length) > maxDist) return maxDist + 1;

  let prev = new Array<number>(b.length + 1);
  let curr = new Array<number>(b.length + 1);
  for (let j = 0; j <= b.length; j++) prev[j] = j;

  for (let i = 1; i <= a.length; i++) {
    curr[0] = i;
    let rowMin = curr[0]!;
    for (let j = 1; j <= b.length; j++) {
      const cost = a[i - 1] === b[j - 1] ? 0 : 1;
      curr[j] = Math.min(prev[j]! + 1, curr[j - 1]! + 1, prev[j - 1]! + cost);
      if (curr[j]! < rowMin) rowMin = curr[j]!;
    }
    if (rowMin > maxDist) return maxDist + 1;
    const tmp = prev;
    prev = curr;
    curr = tmp;
  }
  return prev[b.length]!;
}

/**
 * Affinità 0–100. Early-exit se le stringhe sono troppo diverse.
 */
export function scoreNomeAffinity(query: string, nome: string): number {
  const q = normalizeAffinityText(query);
  const n = normalizeAffinityText(nome);
  if (!q || !n) return 0;
  if (q === n) return 100;

  // Prefisso / inclusione rapida (evita Levenshtein su stringhe lunghissime diverse)
  if (n.includes(q) || q.includes(n)) {
    const ratio = Math.min(q.length, n.length) / Math.max(q.length, n.length);
    return Math.max(0, Math.min(100, Math.round(70 + ratio * 30)));
  }

  const maxLen = Math.max(q.length, n.length);
  const maxDist = Math.max(2, Math.floor(maxLen * 0.35));
  const dist = levenshteinBounded(q, n, maxDist);
  if (dist > maxDist) return 0;

  const editSim = 1 - dist / maxLen;
  return Math.max(0, Math.min(100, Math.round(editSim * 100)));
}

export function scoreCatalogVoce(
  query: string,
  voce: LocalCatalogVoce
): number {
  const byNome = scoreNomeAffinity(query, voce.nome);
  if (byNome >= 92) return byNome;
  return Math.max(byNome, scoreNomeAffinity(query, voce.codice));
}

/**
 * Indice invertito token → voci. Si costruisce una sola volta per catalogo.
 */
export class CatalogSearchIndex {
  private byToken = new Map<string, IndexedVoce[]>();
  private all: IndexedVoce[] = [];
  readonly size: number;

  constructor(catalog: LocalCatalogVoce[]) {
    this.size = catalog.length;
    for (const voce of catalog) {
      const hay = normalizeAffinityText(`${voce.nome} ${voce.codice}`);
      if (!hay) continue;
      const indexed: IndexedVoce = { ...voce, hay };
      this.all.push(indexed);
      const seen = new Set<string>();
      for (const t of significantTokensFromNorm(hay)) {
        if (seen.has(t)) continue;
        seen.add(t);
        const list = this.byToken.get(t);
        if (list) list.push(indexed);
        else this.byToken.set(t, [indexed]);
      }
    }
  }

  search(
    query: string,
    opts?: { limit?: number; minScore?: number; maxScoreCandidates?: number }
  ): Array<LocalCatalogVoce & { score: number }> {
    const q = (query ?? "").trim();
    if (!q || this.size === 0) return [];
    const minScore = opts?.minScore ?? 45;
    const limit = Math.min(Math.max(opts?.limit ?? 36, 1), 48);
    const maxScoreCandidates = opts?.maxScoreCandidates ?? 80;

    const qNorm = normalizeAffinityText(q);
    const qTokens = significantTokensFromNorm(qNorm);
    if (qTokens.length === 0 && !qNorm) return [];

    // Ancora = token più raro (lista più corta) tra i più lunghi
    let candidates: IndexedVoce[] = [];
    if (qTokens.length > 0) {
      const ranked = [...qTokens].sort((a, b) => {
        const la = this.byToken.get(a)?.length ?? Number.MAX_SAFE_INTEGER;
        const lb = this.byToken.get(b)?.length ?? Number.MAX_SAFE_INTEGER;
        if (la !== lb) return la - lb;
        return b.length - a.length;
      });
      const anchor = ranked[0]!;
      candidates = this.byToken.get(anchor) ?? [];
      // Se ancora troppo ampia, interseca col secondo token
      if (candidates.length > maxScoreCandidates && ranked.length >= 2) {
        const second = new Set(this.byToken.get(ranked[1]!) ?? []);
        candidates = candidates.filter((v) => second.has(v));
      }
    } else {
      // Solo numeri/unità: match substring su hay (max scan limitato)
      const needle = qNorm.slice(0, 12);
      for (const v of this.all) {
        if (v.hay.includes(needle)) {
          candidates.push(v);
          if (candidates.length >= maxScoreCandidates) break;
        }
      }
    }

    if (candidates.length > maxScoreCandidates) {
      candidates = candidates.slice(0, maxScoreCandidates);
    }

    // Richiede almeno metà dei token query
    if (qTokens.length >= 2) {
      const need = Math.ceil(qTokens.length * 0.5);
      candidates = candidates.filter((v) => {
        let hits = 0;
        for (const t of qTokens) {
          if (v.hay.includes(t)) hits += 1;
        }
        return hits >= need;
      });
    }

    const scored: Array<LocalCatalogVoce & { score: number }> = [];
    for (const voce of candidates) {
      const score = scoreCatalogVoce(q, voce);
      if (score >= minScore) {
        scored.push({
          kind: voce.kind,
          id: voce.id,
          codice: voce.codice,
          nome: voce.nome,
          score,
        });
      }
    }

    scored.sort((a, b) => {
      if (b.score !== a.score) return b.score - a.score;
      return a.codice.localeCompare(b.codice, "it");
    });
    return scored.slice(0, limit);
  }
}

/** Cache debole per non ricostruire l’indice a ogni keystroke. */
const indexCache = new WeakMap<LocalCatalogVoce[], CatalogSearchIndex>();

export function getCatalogSearchIndex(
  catalog: LocalCatalogVoce[]
): CatalogSearchIndex {
  let idx = indexCache.get(catalog);
  if (!idx) {
    idx = new CatalogSearchIndex(catalog);
    indexCache.set(catalog, idx);
  }
  return idx;
}

/**
 * Ricerca locale via indice (ms anche con migliaia di voci).
 */
export function searchCatalogLocal(
  query: string,
  catalog: LocalCatalogVoce[],
  opts?: { limit?: number; minScore?: number; maxScoreCandidates?: number }
): Array<LocalCatalogVoce & { score: number }> {
  if (!catalog.length) return [];
  return getCatalogSearchIndex(catalog).search(query, opts);
}
