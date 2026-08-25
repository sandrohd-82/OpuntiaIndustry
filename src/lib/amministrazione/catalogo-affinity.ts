/**
 * Affinità catalogo lato client (istantanea).
 * Combina similarità a edit-distance, bigram Dice e overlap token —
 * più accurata di sola pg_trgm su differenze di una cifra (es. ml.280 vs ml.290).
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

function levenshtein(a: string, b: string): number {
  if (a === b) return 0;
  if (!a.length) return b.length;
  if (!b.length) return a.length;
  const row = new Array<number>(b.length + 1);
  for (let j = 0; j <= b.length; j++) row[j] = j;
  for (let i = 1; i <= a.length; i++) {
    let prev = i - 1;
    row[0] = i;
    for (let j = 1; j <= b.length; j++) {
      const tmp = row[j];
      const cost = a[i - 1] === b[j - 1] ? 0 : 1;
      row[j] = Math.min(
        row[j] + 1,
        row[j - 1] + 1,
        prev + cost
      );
      prev = tmp;
    }
  }
  return row[b.length]!;
}

function bigrams(s: string): string[] {
  if (s.length < 2) return s.length === 1 ? [s] : [];
  const out: string[] = [];
  for (let i = 0; i < s.length - 1; i++) out.push(s.slice(i, i + 2));
  return out;
}

function diceCoefficient(a: string, b: string): number {
  if (a === b) return 1;
  if (!a || !b) return 0;
  const A = bigrams(a);
  const B = bigrams(b);
  if (A.length === 0 || B.length === 0) return a === b ? 1 : 0;
  const counts = new Map<string, number>();
  for (const g of A) counts.set(g, (counts.get(g) ?? 0) + 1);
  let inter = 0;
  for (const g of B) {
    const c = counts.get(g) ?? 0;
    if (c > 0) {
      inter += 1;
      counts.set(g, c - 1);
    }
  }
  return (2 * inter) / (A.length + B.length);
}

function tokenSet(text: string): Set<string> {
  const fromNorm = normalizeAffinityText(text).split(" ").filter(Boolean);
  const fromSku = tokenizeInvoiceLine(text);
  return new Set([...fromNorm, ...fromSku].filter((t) => t.length >= 2));
}

function tokenOverlapRatio(query: string, nome: string): number {
  const q = tokenSet(query);
  const n = tokenSet(nome);
  if (q.size === 0 || n.size === 0) return 0;
  let hit = 0;
  for (const t of q) {
    if (n.has(t)) {
      hit += 1;
      continue;
    }
    // prefisso / inclusione (uni / universal, silic / silicone)
    for (const u of n) {
      if (u.includes(t) || t.includes(u)) {
        hit += 0.85;
        break;
      }
    }
  }
  return Math.min(1, hit / q.size);
}

/**
 * Affinità 0–100 tra descrizione riga e nome (o codice) catalogo.
 * Per stringhe quasi uguali (1 carattere su ~18) punta al 90–99%.
 */
export function scoreNomeAffinity(query: string, nome: string): number {
  const q = normalizeAffinityText(query);
  const n = normalizeAffinityText(nome);
  if (!q || !n) return 0;
  if (q === n) return 100;

  const maxLen = Math.max(q.length, n.length);
  const editSim = 1 - levenshtein(q, n) / maxLen;
  const dice = diceCoefficient(q.replace(/\s/g, ""), n.replace(/\s/g, ""));
  const diceSpaced = diceCoefficient(q, n);
  const tokens = tokenOverlapRatio(query, nome);

  // Edit pesa di più su differenze minime (280↔290); dice/token su parafrasi.
  const blended =
    editSim * 0.55 + Math.max(dice, diceSpaced) * 0.3 + tokens * 0.15;

  return Math.max(
    0,
    Math.min(100, Math.round(blended * 100))
  );
}

export function scoreCatalogVoce(
  query: string,
  voce: LocalCatalogVoce
): number {
  return Math.max(
    scoreNomeAffinity(query, voce.nome),
    scoreNomeAffinity(query, voce.codice),
    // nome + codice concatenati (a volte il volume è solo nel codice)
    scoreNomeAffinity(query, `${voce.nome} ${voce.codice}`)
  );
}

/**
 * Ricerca locale sul catalogo già in memoria — tipicamente <50ms anche con migliaia di voci.
 */
export function searchCatalogLocal(
  query: string,
  catalog: LocalCatalogVoce[],
  opts?: { limit?: number; minScore?: number }
): Array<LocalCatalogVoce & { score: number }> {
  const q = (query ?? "").trim();
  if (!q || catalog.length === 0) return [];
  const minScore = opts?.minScore ?? 40;
  const limit = Math.min(Math.max(opts?.limit ?? 40, 1), 80);

  const qNorm = normalizeAffinityText(q);
  const qTokens = [...tokenSet(q)].filter((t) => t.length >= 3);

  const scored: Array<LocalCatalogVoce & { score: number }> = [];
  for (const voce of catalog) {
    // Prefiltro economico: almeno un token significativo nel nome/codice
    if (qTokens.length > 0) {
      const hay = normalizeAffinityText(`${voce.nome} ${voce.codice}`);
      const any =
        hay.includes(qNorm.slice(0, Math.min(12, qNorm.length))) ||
        qTokens.some((t) => hay.includes(t));
      if (!any) continue;
    }
    const score = scoreCatalogVoce(q, voce);
    if (score >= minScore) scored.push({ ...voce, score });
  }

  scored.sort((a, b) => {
    if (b.score !== a.score) return b.score - a.score;
    return a.codice.localeCompare(b.codice, "it");
  });
  return scored.slice(0, limit);
}
