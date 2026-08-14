import type { ProdottoProprioRow } from "@/types/database";

/** Targa completamente libera: lettere, cifre e - _ / (case-sensitive). */
export const CODICE_PRODOTTO_PROPRIO_RE = /^[A-Za-z0-9\-_\/]+$/;

const CODICE_CHARS_RE = /[^A-Za-z0-9\-_\/]/g;

export type ProdottoProprio = {
  id: string;
  codice: string;
  nome: string;
  note: string;
  isBio: boolean;
  createdAt: string;
};

export type ProdottoAttivitaLinkInput = {
  attivitaId: string;
  obbligatoria: boolean;
};

export type ProdottoProprioInput = {
  codice: string;
  nome: string;
  note?: string;
  isBio?: boolean;
  /** @deprecated preferire attivitaLinks */
  attivitaIds?: string[];
  /** Attività oltre la lavorazione (ordine = sort). */
  attivitaLinks?: ProdottoAttivitaLinkInput[];
};

export function sanitizeCodiceProdottoProprio(value: string): string {
  return value.replace(CODICE_CHARS_RE, "").trim();
}

export function isValidCodiceProdottoProprio(codice: string): boolean {
  return CODICE_PRODOTTO_PROPRIO_RE.test(codice) && codice.length >= 1;
}

export function normalizeProdottoProprioInput(
  input: ProdottoProprioInput
): ProdottoProprioInput {
  return {
    codice: sanitizeCodiceProdottoProprio(input.codice),
    nome: input.nome.trim(),
    note: input.note?.trim() ?? "",
    isBio: Boolean(input.isBio),
  };
}

export function mapProdottoProprioRow(row: ProdottoProprioRow): ProdottoProprio {
  return {
    id: row.id,
    codice: row.codice,
    nome: row.nome,
    note: row.note ?? "",
    isBio: Boolean(row.is_bio),
    createdAt: row.created_at,
  };
}

/** Normalizza il nome per confronti anti-duplicato. */
export function normalizeNomeProdottoProprio(nome: string): string {
  return nome
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .trim()
    .replace(/\s+/g, " ");
}

function tokenizeNome(nome: string): string[] {
  return normalizeNomeProdottoProprio(nome)
    .split(" ")
    .filter((t) => t.length >= 2);
}

function levenshtein(a: string, b: string): number {
  if (a === b) return 0;
  if (!a.length) return b.length;
  if (!b.length) return a.length;
  const prev = new Array<number>(b.length + 1);
  const curr = new Array<number>(b.length + 1);
  for (let j = 0; j <= b.length; j++) prev[j] = j;
  for (let i = 1; i <= a.length; i++) {
    curr[0] = i;
    for (let j = 1; j <= b.length; j++) {
      const cost = a[i - 1] === b[j - 1] ? 0 : 1;
      curr[j] = Math.min(curr[j - 1] + 1, prev[j] + 1, prev[j - 1] + cost);
    }
    for (let j = 0; j <= b.length; j++) prev[j] = curr[j];
  }
  return prev[b.length];
}

/** Score 0–1: quanto il nome di query è simile a un candidato. */
export function scoreNomeProdottoProprioSimilarity(
  query: string,
  candidate: string
): number {
  const q = normalizeNomeProdottoProprio(query);
  const c = normalizeNomeProdottoProprio(candidate);
  if (!q || !c) return 0;
  if (q === c) return 1;
  if (c.includes(q) || q.includes(c)) {
    const shorter = Math.min(q.length, c.length);
    const longer = Math.max(q.length, c.length);
    return 0.72 + (shorter / longer) * 0.25;
  }

  const qTokens = tokenizeNome(query);
  const cTokens = new Set(tokenizeNome(candidate));
  if (qTokens.length && cTokens.size) {
    const overlap = qTokens.filter((t) => cTokens.has(t)).length;
    const tokenScore = overlap / Math.max(qTokens.length, cTokens.size);
    if (tokenScore >= 0.5) return 0.55 + tokenScore * 0.4;
  }

  const maxLen = Math.max(q.length, c.length);
  if (maxLen === 0) return 0;
  const dist = levenshtein(q, c);
  const editScore = 1 - dist / maxLen;
  return editScore >= 0.55 ? editScore : 0;
}

export type ProdottoNomeMatch = {
  prodotto: ProdottoProprio;
  score: number;
  exact: boolean;
};

/**
 * Ricerca full-text leggera su nome/codice: restituisce i più simili.
 */
export function findSimilarProdottiPropri(
  query: string,
  catalog: ProdottoProprio[],
  options?: { excludeId?: string | null; limit?: number; minScore?: number }
): ProdottoNomeMatch[] {
  const q = query.trim();
  if (q.length < 2) return [];
  const excludeId = options?.excludeId ?? null;
  const limit = options?.limit ?? 8;
  const minScore = options?.minScore ?? 0.45;
  const qNorm = normalizeNomeProdottoProprio(q);
  const qCode = q.replace(/\s+/g, "");

  return catalog
    .filter((m) => m.id !== excludeId)
    .map((prodotto) => {
      const nameScore = scoreNomeProdottoProprioSimilarity(q, prodotto.nome);
      const codeHit =
        prodotto.codice.toLowerCase().includes(qCode.toLowerCase()) ||
        qCode.toLowerCase().includes(prodotto.codice.toLowerCase());
      const score = Math.max(nameScore, codeHit ? 0.5 : 0);
      return {
        prodotto,
        score,
        exact:
          normalizeNomeProdottoProprio(prodotto.nome) === qNorm &&
          qNorm.length > 0,
      };
    })
    .filter((m) => m.score >= minScore || m.exact)
    .sort(
      (a, b) =>
        b.score - a.score || a.prodotto.nome.localeCompare(b.prodotto.nome)
    )
    .slice(0, limit);
}

export function findProdottoProprioByCodice(
  codice: string,
  catalog: ProdottoProprio[],
  excludeId?: string | null
): ProdottoProprio | null {
  const target = sanitizeCodiceProdottoProprio(codice);
  if (!isValidCodiceProdottoProprio(target)) return null;
  return (
    catalog.find(
      (m) => m.codice === target && (!excludeId || m.id !== excludeId)
    ) ?? null
  );
}

export function findProdottoProprioByNomeExact(
  nome: string,
  catalog: ProdottoProprio[],
  excludeId?: string | null
): ProdottoProprio | null {
  const target = normalizeNomeProdottoProprio(nome);
  if (!target) return null;
  return (
    catalog.find(
      (m) =>
        normalizeNomeProdottoProprio(m.nome) === target &&
        (!excludeId || m.id !== excludeId)
    ) ?? null
  );
}

export type ProdottiPropriTextField = "nome" | "note" | "entrambi";

export type ProdottiPropriFilters = {
  /** Ricerca libera sulla targa/codice. */
  codice: string;
  textQuery: string;
  textField: ProdottiPropriTextField;
  showBio: boolean;
  showConvenzionale: boolean;
};

export function emptyProdottiPropriFilters(): ProdottiPropriFilters {
  return {
    codice: "",
    textQuery: "",
    textField: "nome",
    showBio: true,
    showConvenzionale: true,
  };
}

export function hasActiveProdottiPropriFilters(filters: ProdottiPropriFilters): boolean {
  return (
    Boolean(filters.codice.trim()) ||
    Boolean(filters.textQuery.trim()) ||
    !filters.showBio ||
    !filters.showConvenzionale
  );
}

export function filterProdottiPropri(
  prodotti: ProdottoProprio[],
  filters: ProdottiPropriFilters
): ProdottoProprio[] {
  const codiceQ = filters.codice.trim().toLowerCase();
  const textQ = normalizeNomeProdottoProprio(filters.textQuery);

  return prodotti.filter((m) => {
    if (filters.showBio !== filters.showConvenzionale) {
      if (filters.showBio && !m.isBio) return false;
      if (filters.showConvenzionale && m.isBio) return false;
    } else if (!filters.showBio && !filters.showConvenzionale) {
      return false;
    }

    if (codiceQ && !m.codice.toLowerCase().includes(codiceQ)) {
      return false;
    }

    if (textQ) {
      const nomeHit = normalizeNomeProdottoProprio(m.nome).includes(textQ);
      const noteHit = normalizeNomeProdottoProprio(m.note).includes(textQ);
      if (filters.textField === "nome" && !nomeHit) return false;
      if (filters.textField === "note" && !noteHit) return false;
      if (filters.textField === "entrambi" && !nomeHit && !noteHit) return false;
    }

    return true;
  });
}
