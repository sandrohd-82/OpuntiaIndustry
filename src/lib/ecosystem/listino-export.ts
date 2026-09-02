import type { Listino, ListinoRiga } from "@/lib/ecosystem/listini";
import type { ListinoStato } from "@/types/database";

export const LISTINO_STATO_EXPORT_LABEL: Record<ListinoStato, string> = {
  bozza: "Bozza",
  in_revisione: "In Revisione",
  in_uso: "In Uso",
  obsoleto: "Obsoleto",
  bozza_traduzione: "Bozza traduzione",
};

export const LISTINO_EXPORT_PRODUCT_HEAD = [
  "Codice prodotto (Targa)",
  "Descrizione prodotto",
  "Prezzo",
] as const;

export const LISTINO_EXPORT_DISCOUNT_HEAD = [
  "Codice Sconto (Targa)",
  "Qty da",
  "Qty a",
  "Tipo Conf.",
  "Conf. da",
  "% Sconto",
] as const;

export type ListinoExportMeta = {
  listinoId: string;
  codice: string;
  nome: string;
  statoLabel: string;
  versione: number;
  locale: string;
  exportedAt: string;
  actor: string;
  scope: "tutti" | "selezione";
  prodottiCount: number;
  scontiCount: number;
};

export type ListinoExportRow =
  | { kind: "product_head" }
  | {
      kind: "product";
      codice: string;
      descrizione: string;
      prezzo: string;
    }
  | { kind: "discount_head" }
  | {
      kind: "discount";
      targa: string;
      qtyDa: string;
      qtyA: string;
      tipoConf: string;
      confDa: string;
      scontoPct: string;
    }
  | { kind: "spacer" };

function fmtNum(n: number, digits = 2): string {
  return n.toLocaleString("it-IT", {
    minimumFractionDigits: digits,
    maximumFractionDigits: digits,
  });
}

export function listinoExportFilename(
  meta: ListinoExportMeta,
  ext: "pdf" | "xlsx"
): string {
  const stamp = new Date().toISOString().slice(0, 10);
  const code = meta.codice.replace(/[^\w\-]+/g, "_").slice(0, 40);
  const scope = meta.scope === "selezione" ? "selezione" : "completo";
  return `listino_${code}_${scope}_${stamp}.${ext}`;
}

export function buildListinoExport(
  listino: Listino,
  righe: ListinoRiga[],
  opts: { statoLabel: string; actor: string; scope: "tutti" | "selezione" }
): { meta: ListinoExportMeta; rows: ListinoExportRow[] } {
  const scontiCount = righe.reduce((n, r) => n + r.condizioni.length, 0);
  const meta: ListinoExportMeta = {
    listinoId: listino.id,
    codice: listino.codice,
    nome: listino.nome,
    statoLabel: opts.statoLabel,
    versione: listino.versione,
    locale: listino.locale,
    exportedAt: new Date().toLocaleString("it-IT", {
      day: "2-digit",
      month: "2-digit",
      year: "numeric",
      hour: "2-digit",
      minute: "2-digit",
    }),
    actor: opts.actor,
    scope: opts.scope,
    prodottiCount: righe.length,
    scontiCount,
  };

  const rows: ListinoExportRow[] = [];
  for (const r of righe) {
    if (rows.length) rows.push({ kind: "spacer" });
    rows.push({ kind: "product_head" });
    rows.push({
      kind: "product",
      codice: r.prodottoCodice ?? "",
      descrizione: r.prodottoNome ?? "",
      prezzo: `${fmtNum(r.prezzo)} €/${r.unitaMisura}`,
    });
    rows.push({ kind: "discount_head" });
    for (const c of r.condizioni) {
      const tipo = [c.imballaggioCodice, c.imballaggioNome]
        .filter(Boolean)
        .join(" — ");
      rows.push({
        kind: "discount",
        targa: c.targa || "—",
        qtyDa: fmtNum(c.qtyDa, c.qtyDa % 1 === 0 ? 0 : 2),
        qtyA:
          c.qtyA == null ? "" : fmtNum(c.qtyA, c.qtyA % 1 === 0 ? 0 : 2),
        tipoConf: tipo,
        confDa: c.kgConfezione
          ? fmtNum(c.kgConfezione, c.kgConfezione % 1 === 0 ? 0 : 2)
          : "",
        scontoPct: fmtNum(c.scontoPct, 1),
      });
    }
  }

  return { meta, rows };
}

export function listinoExportRowCells(row: ListinoExportRow): string[] {
  if (row.kind === "product_head") {
    return [...LISTINO_EXPORT_PRODUCT_HEAD, "", "", ""];
  }
  if (row.kind === "product") {
    return [row.codice, row.descrizione, row.prezzo, "", "", ""];
  }
  if (row.kind === "discount_head") {
    return [...LISTINO_EXPORT_DISCOUNT_HEAD];
  }
  if (row.kind === "discount") {
    return [
      row.targa,
      row.qtyDa,
      row.qtyA,
      row.tipoConf,
      row.confDa,
      row.scontoPct,
    ];
  }
  return ["", "", "", "", "", ""];
}
