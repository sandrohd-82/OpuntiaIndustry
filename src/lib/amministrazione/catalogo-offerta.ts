import type {
  CatalogoProdottoFornitoreRow,
  CatalogoServizioRow,
  FornitoreTipologia,
} from "@/types/database";
import {
  normalizeNomeMateriaPrima,
  scoreNomeMateriaPrimaSimilarity,
} from "@/lib/amministrazione/materie-prime";

export type CatalogoOffertaKind = "servizio" | "prodotto";

export type CatalogoOffertaItem = {
  id: string;
  codice: string;
  nome: string;
  note: string;
  isBio: boolean;
  createdAt: string;
};

export type CatalogoOffertaInput = {
  codice: string;
  nome: string;
  note?: string;
  isBio?: boolean;
};

export const FORNITORE_TIPOLOGIE: Array<{
  value: FornitoreTipologia;
  label: string;
}> = [
  { value: "servizio", label: "Servizi" },
  { value: "prodotto", label: "Prodotti" },
  { value: "materia_prima", label: "Materia prima" },
];

export function labelFornitoreTipologia(t: FornitoreTipologia): string {
  return FORNITORE_TIPOLOGIE.find((x) => x.value === t)?.label ?? t;
}

export function normalizeTipologie(
  values: FornitoreTipologia[] | null | undefined
): FornitoreTipologia[] {
  const allowed = new Set<FornitoreTipologia>([
    "servizio",
    "prodotto",
    "materia_prima",
  ]);
  const out: FornitoreTipologia[] = [];
  for (const v of values ?? []) {
    if (allowed.has(v) && !out.includes(v)) out.push(v);
  }
  return out;
}

const BODY_RE = /[^A-Za-z0-9\-_\/]/g;

export function catalogoPrefix(kind: CatalogoOffertaKind): "Sz" | "Pr" {
  return kind === "servizio" ? "Sz" : "Pr";
}

export function catalogoCodiceRe(kind: CatalogoOffertaKind): RegExp {
  return kind === "servizio"
    ? /^Sz[A-Za-z0-9\-_\/]+$/i
    : /^Pr[A-Za-z0-9\-_\/]+$/i;
}

export function stripCatalogoPrefix(
  kind: CatalogoOffertaKind,
  codice: string
): string {
  const raw = codice.trim();
  if (raw.length >= 2 && raw.slice(0, 2).toLowerCase() === catalogoPrefix(kind).toLowerCase()) {
    return raw.slice(2);
  }
  return raw;
}

export function sanitizeCatalogoBody(
  kind: CatalogoOffertaKind,
  value: string
): string {
  let body = value.replace(BODY_RE, "");
  const p = catalogoPrefix(kind).toLowerCase();
  while (body.length >= 2 && body.slice(0, 2).toLowerCase() === p) {
    body = body.slice(2);
  }
  return body;
}

/** Prefisso canonico Sz/Pr + corpo così come digitato (dopo sanitize). */
export function composeCatalogoCodice(
  kind: CatalogoOffertaKind,
  body: string
): string {
  return catalogoPrefix(kind) + sanitizeCatalogoBody(kind, body);
}

export function sanitizeCatalogoCodice(
  kind: CatalogoOffertaKind,
  value: string
): string {
  return composeCatalogoCodice(kind, stripCatalogoPrefix(kind, value));
}

export function isValidCatalogoCodice(
  kind: CatalogoOffertaKind,
  codice: string
): boolean {
  return catalogoCodiceRe(kind).test(codice.trim());
}

export function normalizeCatalogoInput(
  kind: CatalogoOffertaKind,
  input: CatalogoOffertaInput
): CatalogoOffertaInput {
  return {
    codice: sanitizeCatalogoCodice(kind, input.codice),
    nome: input.nome.trim(),
    note: input.note?.trim() ?? "",
    isBio: Boolean(input.isBio),
  };
}

export function mapCatalogoServizio(row: CatalogoServizioRow): CatalogoOffertaItem {
  return {
    id: row.id,
    codice: row.codice,
    nome: row.nome,
    note: row.note ?? "",
    isBio: Boolean(row.is_bio),
    createdAt: row.created_at,
  };
}

export function mapCatalogoProdottoFornitore(
  row: CatalogoProdottoFornitoreRow
): CatalogoOffertaItem {
  return {
    id: row.id,
    codice: row.codice,
    nome: row.nome,
    note: row.note ?? "",
    isBio: Boolean(row.is_bio),
    createdAt: row.created_at,
  };
}

export function normalizeNomeCatalogo(nome: string): string {
  return normalizeNomeMateriaPrima(nome);
}

export type CatalogoNomeMatch = {
  item: CatalogoOffertaItem;
  score: number;
  exact: boolean;
};

export function findSimilarCatalogo(
  query: string,
  catalog: CatalogoOffertaItem[],
  options?: { excludeId?: string | null; limit?: number; minScore?: number }
): CatalogoNomeMatch[] {
  const q = query.trim();
  if (q.length < 2) return [];
  const excludeId = options?.excludeId ?? null;
  const limit = options?.limit ?? 8;
  const minScore = options?.minScore ?? 0.45;
  const qNorm = normalizeNomeCatalogo(q);
  const qCode = q.replace(/\s+/g, "");

  return catalog
    .filter((m) => m.id !== excludeId)
    .map((item) => {
      const nameScore = scoreNomeMateriaPrimaSimilarity(q, item.nome);
      const codeHit =
        item.codice.toLowerCase().includes(qCode.toLowerCase()) ||
        qCode.toLowerCase().includes(item.codice.toLowerCase());
      const score = Math.max(nameScore, codeHit ? 0.5 : 0);
      return {
        item,
        score,
        exact: normalizeNomeCatalogo(item.nome) === qNorm && qNorm.length > 0,
      };
    })
    .filter((m) => m.score >= minScore || m.exact)
    .sort(
      (a, b) =>
        b.score - a.score || a.item.nome.localeCompare(b.item.nome, "it")
    )
    .slice(0, limit);
}

export function findCatalogoByCodice(
  kind: CatalogoOffertaKind,
  codice: string,
  catalog: CatalogoOffertaItem[],
  excludeId?: string | null
): CatalogoOffertaItem | null {
  const target = sanitizeCatalogoCodice(kind, codice);
  if (!isValidCatalogoCodice(kind, target)) return null;
  const lower = target.toLowerCase();
  return (
    catalog.find(
      (m) =>
        m.codice.toLowerCase() === lower && (!excludeId || m.id !== excludeId)
    ) ?? null
  );
}

export function findCatalogoByNomeExact(
  nome: string,
  catalog: CatalogoOffertaItem[],
  excludeId?: string | null
): CatalogoOffertaItem | null {
  const target = normalizeNomeCatalogo(nome);
  if (!target) return null;
  return (
    catalog.find(
      (m) =>
        normalizeNomeCatalogo(m.nome) === target &&
        (!excludeId || m.id !== excludeId)
    ) ?? null
  );
}
