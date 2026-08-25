/**
 * Affinità catalogo lato client — ottimizzata per non bloccare l’UI.
 * Prefiltro stretto + cap candidati + Levenshtein con early-abort.
 */

import { tokenizeInvoiceLine } from "@/lib/sku-generator";

export type LocalCatalogVoce = {
  kind: "servizio" | "prodotto" | "materia" | "contributo";
  id: string;
  codice: string;
  nome: string;
};

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

/** Levenshtein con early-exit se distanza > maxDist (evita O(n²) inutili). */
function levenshteinBounded(a: string, b: string, maxDist: number): number {
  if (a === b) return 0;
  if (!a.length) return b.length > maxDist ? maxDist + 1 : b.length;
  if (!b.length) return a.length > maxDist ? maxDist + 1 : a.length;
  if (Math.abs(a.length - b.length) > maxDist) return maxDist + 1;

  // Due righe sole (memoria O(min(n,m)))
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

function bigramDice(a: string, b: string): number {
  if (a === b) return 1;
  if (a.length < 2 || b.length < 2) return a === b ? 1 : 0;
  const counts = new Map<string, number>();
  for (let i = 0; i < a.length - 1; i++) {
    const g = a.slice(i, i + 2);
    counts.set(g, (counts.get(g) ?? 0) + 1);
  }
  let inter = 0;
  let bCount = 0;
  for (let i = 0; i < b.length - 1; i++) {
    bCount += 1;
    const g = b.slice(i, i + 2);
    const c = counts.get(g) ?? 0;
    if (c > 0) {
      inter += 1;
      counts.set(g, c - 1);
    }
  }
  const aCount = Math.max(1, a.length - 1);
  return (2 * inter) / (aCount + bCount);
}

function significantTokens(text: string): string[] {
  const fromNorm = normalizeAffinityText(text).split(" ").filter(Boolean);
  const fromSku = tokenizeInvoiceLine(text);
  const set = new Set(
    [...fromNorm, ...fromSku].filter(
      (t) => t.length >= 3 && !/^\d+([.,]\d+)?$/.test(t)
    )
  );
  return [...set];
}

/**
 * Affinità 0–100. Early-exit se le stringhe sono troppo diverse.
 */
export function scoreNomeAffinity(query: string, nome: string): number {
  const q = normalizeAffinityText(query);
  const n = normalizeAffinityText(nome);
  if (!q || !n) return 0;
  if (q === n) return 100;

  const maxLen = Math.max(q.length, n.length);
  // Oltre ~40% di edit → score basso: non serve Levenshtein completo
  const maxDist = Math.max(2, Math.floor(maxLen * 0.4));
  const dist = levenshteinBounded(q, n, maxDist);
  if (dist > maxDist) {
    // Solo dice veloce come fallback debole
    const dice = bigramDice(q.replace(/\s/g, ""), n.replace(/\s/g, ""));
    return Math.max(0, Math.min(100, Math.round(dice * 70)));
  }

  const editSim = 1 - dist / maxLen;
  const dice = bigramDice(q.replace(/\s/g, ""), n.replace(/\s/g, ""));
  const blended = editSim * 0.7 + dice * 0.3;
  return Math.max(0, Math.min(100, Math.round(blended * 100)));
}

export function scoreCatalogVoce(
  query: string,
  voce: LocalCatalogVoce
): number {
  // Nome prima (caso tipico); codice solo se utile
  const byNome = scoreNomeAffinity(query, voce.nome);
  if (byNome >= 95) return byNome;
  const byCodice = scoreNomeAffinity(query, voce.codice);
  return Math.max(byNome, byCodice);
}

/**
 * Ricerca locale non bloccante: prefiltro stretto + max candidati scorati.
 */
export function searchCatalogLocal(
  query: string,
  catalog: LocalCatalogVoce[],
  opts?: { limit?: number; minScore?: number; maxScoreCandidates?: number }
): Array<LocalCatalogVoce & { score: number }> {
  const q = (query ?? "").trim();
  if (!q || catalog.length === 0) return [];
  const minScore = opts?.minScore ?? 45;
  const limit = Math.min(Math.max(opts?.limit ?? 40, 1), 60);
  const maxScoreCandidates = opts?.maxScoreCandidates ?? 180;

  const qNorm = normalizeAffinityText(q);
  const qTokens = significantTokens(q);
  // Token più discriminante (più lungo) per prefiltro
  const anchor =
    qTokens.length > 0
      ? [...qTokens].sort((a, b) => b.length - a.length)[0]!
      : qNorm.slice(0, Math.min(8, qNorm.length));

  if (!anchor) return [];

  const candidates: LocalCatalogVoce[] = [];
  for (const voce of catalog) {
    const hay = normalizeAffinityText(`${voce.nome} ${voce.codice}`);
    if (!hay.includes(anchor)) continue;
    // Almeno metà dei token significativi devono comparire
    if (qTokens.length >= 2) {
      let hits = 0;
      for (const t of qTokens) {
        if (hay.includes(t)) hits += 1;
      }
      if (hits < Math.ceil(qTokens.length * 0.5)) continue;
    }
    candidates.push(voce);
    if (candidates.length >= maxScoreCandidates) break;
  }

  const scored: Array<LocalCatalogVoce & { score: number }> = [];
  for (const voce of candidates) {
    const score = scoreCatalogVoce(q, voce);
    if (score >= minScore) scored.push({ ...voce, score });
  }

  scored.sort((a, b) => {
    if (b.score !== a.score) return b.score - a.score;
    return a.codice.localeCompare(b.codice, "it");
  });
  return scored.slice(0, limit);
}
