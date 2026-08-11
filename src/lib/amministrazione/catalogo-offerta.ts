import { formatCodiceTargaBody } from "@/lib/amministrazione/codice-targa";
import type {
  CatalogoProdottoFornitoreRow,
  CatalogoServizioRow,
  FornitoreTipologia,
} from "@/types/database";

export type CatalogoOffertaItem = {
  id: string;
  codice: string;
  nome: string;
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

export function mapCatalogoServizio(
  row: CatalogoServizioRow
): CatalogoOffertaItem {
  return { id: row.id, codice: row.codice, nome: row.nome };
}

export function mapCatalogoProdottoFornitore(
  row: CatalogoProdottoFornitoreRow
): CatalogoOffertaItem {
  return { id: row.id, codice: row.codice, nome: row.nome };
}

/** Prefissi catalogo: SRV001 / PRF001 */
export function nextCatalogoCodice(
  prefix: "SRV" | "PRF",
  used: Iterable<string>
): string {
  const taken = new Set(
    [...used].map((c) => c.trim().toUpperCase()).filter(Boolean)
  );
  for (let i = 1; i < 4096; i++) {
    const candidate = `${prefix}${formatCodiceTargaBody(i)}`;
    if (!taken.has(candidate)) return candidate;
  }
  throw new Error(`Nessun codice disponibile per ${prefix}`);
}
