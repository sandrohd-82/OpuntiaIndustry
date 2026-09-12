export type RubricaMansioneAffinita = {
  id: string;
  nome: string;
  affinita: number;
};

export function normalizeMansioneNome(value: string): string {
  return value
    .normalize("NFD")
    .replace(/\p{M}/gu, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}

export function codiceMansioneFromNome(value: string): string {
  const slug = normalizeMansioneNome(value).replace(/\s+/g, "-").slice(0, 60);
  return slug || "mansione";
}

function bigrams(value: string): string[] {
  const t = value.replace(/ /g, "");
  if (t.length < 2) return t ? [t] : [];
  const out: string[] = [];
  for (let i = 0; i < t.length - 1; i += 1) {
    out.push(t.slice(i, i + 2));
  }
  return out;
}

function diceCoefficient(a: string, b: string): number {
  const left = bigrams(a);
  const right = bigrams(b);
  if (left.length === 0 && right.length === 0) return 1;
  if (left.length === 0 || right.length === 0) return 0;
  const counts = new Map<string, number>();
  for (const token of left) {
    counts.set(token, (counts.get(token) ?? 0) + 1);
  }
  let inter = 0;
  for (const token of right) {
    const n = counts.get(token) ?? 0;
    if (n > 0) {
      inter += 1;
      counts.set(token, n - 1);
    }
  }
  return (2 * inter) / (left.length + right.length);
}

function levenshtein(a: string, b: string): number {
  if (a === b) return 0;
  if (!a.length) return b.length;
  if (!b.length) return a.length;
  const prev = new Array<number>(b.length + 1);
  const curr = new Array<number>(b.length + 1);
  for (let j = 0; j <= b.length; j += 1) prev[j] = j;
  for (let i = 1; i <= a.length; i += 1) {
    curr[0] = i;
    for (let j = 1; j <= b.length; j += 1) {
      const cost = a[i - 1] === b[j - 1] ? 0 : 1;
      curr[j] = Math.min(curr[j - 1] + 1, prev[j] + 1, prev[j - 1] + cost);
    }
    for (let j = 0; j <= b.length; j += 1) prev[j] = curr[j];
  }
  return prev[b.length];
}

export function scoreMansioneAffinita(query: string, candidate: string): number {
  const q = normalizeMansioneNome(query);
  const c = normalizeMansioneNome(candidate);
  if (!q || !c) return 0;
  if (q === c) return 1;
  const maxLen = Math.max(q.length, c.length);
  const lev = maxLen === 0 ? 1 : 1 - levenshtein(q, c) / maxLen;
  return Math.max(diceCoefficient(q, c), lev);
}

/** Affinità stretta: maggiori del 75%. */
export function mansioniAffini(
  nome: string,
  catalog: Array<{ id: string; nome: string }>,
  soglia = 75
): RubricaMansioneAffinita[] {
  const q = normalizeMansioneNome(nome);
  if (!q) return [];
  return catalog
    .map((item) => ({
      id: item.id,
      nome: item.nome,
      affinita: Math.round(scoreMansioneAffinita(nome, item.nome) * 100),
    }))
    .filter((item) => item.affinita > soglia)
    .sort((a, b) => b.affinita - a.affinita || a.nome.localeCompare(b.nome, "it"));
}
