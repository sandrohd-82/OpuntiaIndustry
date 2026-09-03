import type {
  Listino,
  ListinoDisponibilita,
  ListinoRiga,
} from "@/lib/ecosystem/listini";
import { LISTINO_DISPONIBILITA } from "@/lib/ecosystem/listini";
import {
  listinoExportI18n,
  type ListinoExportI18n,
} from "@/lib/ecosystem/listino-export-i18n";
import type { ListinoStato } from "@/types/database";
import {
  forceTranslateRecognizableText,
  type ListinoTraduzioneMaps,
} from "@/lib/ecosystem/listino-translate";

export function filterListinoRigheExport(
  righe: ListinoRiga[],
  disponibilita: readonly ListinoDisponibilita[]
): ListinoRiga[] {
  const allowed = new Set(
    disponibilita.length ? disponibilita : LISTINO_DISPONIBILITA
  );
  return righe.filter((r) => allowed.has(r.disponibilita));
}

export const LISTINO_STATO_EXPORT_LABEL: Record<ListinoStato, string> =
  listinoExportI18n("it").stato;

export const LISTINO_EXPORT_PRODUCT_HEAD = listinoExportI18n("it").productHead;
export const LISTINO_EXPORT_DISCOUNT_HEAD = listinoExportI18n("it").discountHead;

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
  | { kind: "product_head"; labels: [string, string, string] }
  | {
      kind: "product";
      codice: string;
      descrizione: string;
      prezzo: string;
    }
  | { kind: "discount_head"; labels: [string, string, string, string, string, string] }
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

function fmtNum(n: number, digits: number, bcp47: string): string {
  return n.toLocaleString(bcp47, {
    minimumFractionDigits: digits,
    maximumFractionDigits: digits,
  });
}

function umLabel(um: string, i18n: ListinoExportI18n): string {
  return um === "lt" ? i18n.umLt : i18n.umKg;
}

function fmtQty(n: number, um: string, i18n: ListinoExportI18n): string {
  return `${fmtNum(n, n % 1 === 0 ? 0 : 2, i18n.bcp47)} ${umLabel(um, i18n)}`;
}

function fileSlug(value: string): string {
  return value
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^\w\-]+/g, "_")
    .replace(/_+/g, "_")
    .replace(/^_|_$/g, "")
    .slice(0, 48);
}

export function listinoExportFilename(
  meta: ListinoExportMeta,
  ext: "pdf" | "xlsx"
): string {
  const i18n = listinoExportI18n(meta.locale);
  const stamp = new Date().toISOString().slice(0, 10);
  const code = fileSlug(meta.codice) || "listino";
  const scope = meta.scope === "selezione" ? i18n.scopeSel : i18n.scopeAll;
  return `${i18n.filePrefix}_${code}_${scope}_${stamp}.${ext}`;
}

export function buildListinoExport(
  listino: Listino,
  righe: ListinoRiga[],
  opts: {
    statoLabel: string;
    actor: string;
    scope: "tutti" | "selezione";
    traduzioni?: ListinoTraduzioneMaps;
  }
): { meta: ListinoExportMeta; rows: ListinoExportRow[] } {
  const i18n = listinoExportI18n(listino.locale);
  const trad = opts.traduzioni;
  const scontiCount = righe.reduce((n, r) => n + r.condizioni.length, 0);
  const meta: ListinoExportMeta = {
    listinoId: listino.id,
    codice: listino.codice,
    nome: forceTranslateRecognizableText(
      trad?.listinoNome?.trim() || listino.nome,
      listino.locale
    ),
    statoLabel: i18n.stato[listino.stato] ?? opts.statoLabel,
    versione: listino.versione,
    locale: listino.locale,
    exportedAt: new Date().toLocaleString(i18n.bcp47, {
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
    if (rows.length) {
      rows.push({ kind: "spacer" });
      rows.push({ kind: "spacer" });
    }
    rows.push({ kind: "product_head", labels: i18n.productHead });
    const descrizione = forceTranslateRecognizableText(
      (r.prodottoId && trad?.prodotti.get(r.prodottoId)) ||
        r.prodottoNome ||
        "",
      listino.locale
    );
    rows.push({
      kind: "product",
      codice: r.prodottoCodice ?? "",
      descrizione,
      prezzo: `${fmtNum(r.prezzo, 2, i18n.bcp47)} €/${r.unitaMisura}`,
    });
    if (!r.condizioni.length) continue;
    rows.push({ kind: "discount_head", labels: i18n.discountHead });
    for (const c of r.condizioni) {
      const translatedPack = c.imballaggioVoceId
        ? trad?.imballaggi.get(c.imballaggioVoceId)
        : undefined;
      const commercial = forceTranslateRecognizableText(
        (translatedPack || c.imballaggioNomeCommerciale || "").trim(),
        listino.locale
      );
      const tipo = commercial
        ? commercial
        : forceTranslateRecognizableText(
            [c.imballaggioCodice, c.imballaggioNome].filter(Boolean).join(" — "),
            listino.locale
          );
      rows.push({
        kind: "discount",
        targa: c.targa || "—",
        qtyDa: fmtQty(c.qtyDa, r.unitaMisura, i18n),
        qtyA: c.qtyA == null ? "" : fmtQty(c.qtyA, r.unitaMisura, i18n),
        tipoConf: tipo,
        confDa: c.kgConfezione ? fmtQty(c.kgConfezione, r.unitaMisura, i18n) : "",
        scontoPct: fmtNum(c.scontoPct, 1, i18n.bcp47),
      });
    }
  }

  return { meta, rows };
}

export function listinoExportRowCells(row: ListinoExportRow): string[] {
  if (row.kind === "product_head") {
    return [...row.labels, "", "", ""];
  }
  if (row.kind === "product") {
    return [row.codice, row.descrizione, row.prezzo, "", "", ""];
  }
  if (row.kind === "discount_head") {
    return [...row.labels];
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
