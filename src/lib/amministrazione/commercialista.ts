import { z } from "zod";
import { roundMoney } from "@/lib/amministrazione/fatture";
import type { TrimestreNumero } from "@/lib/amministrazione/trimestre-commerciale";
import {
  dateRangeForTrimestre,
  labelTrimestre,
} from "@/lib/amministrazione/trimestre-commerciale";

/** Aliquota IVA aziendale standard (commercializzazione). */
export const IVA_AZIENDALE_PCT = 22;

export const commercialistaSummarySchema = z.object({
  anno: z.number().int().min(2000).max(2100),
  trimestre: z.union([
    z.literal(1),
    z.literal(2),
    z.literal(3),
    z.literal(4),
  ]),
});

export type CommercialistaSummaryInput = z.infer<
  typeof commercialistaSummarySchema
>;

export type ImportoConIva = {
  imponibile: number;
  iva: number;
  totale: number;
};

export type CommercialistaColonnaTotali = {
  documenti: ImportoConIva;
  vocePrimaria: ImportoConIva;
  beniAmmortizzabili: ImportoConIva;
  conteggioDocumenti: number;
};

export type CommercialistaSummary = {
  anno: number;
  trimestre: TrimestreNumero;
  labelTrimestre: string;
  dal: string;
  al: string;
  /** true se dal/al sono personalizzati (tabella trimestri_commercialista). */
  periodoPersonalizzato: boolean;
  ivaAliquotaDefaultPct: number;
  /** KPI: totale fatture emesse (incassi) del periodo. */
  totaleIncassi: number;
  /** KPI: totale fatture ricevute del periodo. */
  totaleRicevute: number;
  emesse: CommercialistaColonnaTotali;
  ricevute: CommercialistaColonnaTotali;
};

export function emptyImportoConIva(): ImportoConIva {
  return { imponibile: 0, iva: 0, totale: 0 };
}

export function emptyColonna(): CommercialistaColonnaTotali {
  return {
    documenti: emptyImportoConIva(),
    vocePrimaria: emptyImportoConIva(),
    beniAmmortizzabili: emptyImportoConIva(),
    conteggioDocumenti: 0,
  };
}

export function buildPeriodoLabel(anno: number, trim: TrimestreNumero) {
  const { dal, al } = dateRangeForTrimestre(anno, trim);
  return {
    labelTrimestre: labelTrimestre(anno, trim),
    dal,
    al,
  };
}

export const upsertTrimestreCommercialistaSchema = z
  .object({
    anno: z.number().int().min(2000).max(2100),
    trimestre: z.union([
      z.literal(1),
      z.literal(2),
      z.literal(3),
      z.literal(4),
    ]),
    dal: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Data inizio non valida"),
    al: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Data fine non valida"),
    note: z.string().max(500).optional(),
  })
  .refine((v) => v.dal <= v.al, {
    message: "La data inizio deve essere ≤ data fine.",
    path: ["al"],
  });

export type UpsertTrimestreCommercialistaInput = z.infer<
  typeof upsertTrimestreCommercialistaSchema
>;

export function resolveIvaPercentuale(raw: unknown): number {
  const n = Number(raw);
  if (Number.isFinite(n) && n > 0) return n;
  return IVA_AZIENDALE_PCT;
}

export function ivaDaImponibile(
  imponibile: number,
  ivaPercentuale: number
): number {
  return roundMoney((imponibile * ivaPercentuale) / 100);
}

export function toImportoConIva(
  imponibile: number,
  ivaPercentuale: number
): ImportoConIva {
  const imp = roundMoney(imponibile);
  const iva = ivaDaImponibile(imp, ivaPercentuale);
  return {
    imponibile: imp,
    iva,
    totale: roundMoney(imp + iva),
  };
}

export function sumImportiConIva(parts: ImportoConIva[]): ImportoConIva {
  let imponibile = 0;
  let iva = 0;
  for (const p of parts) {
    imponibile += p.imponibile;
    iva += p.iva;
  }
  return {
    imponibile: roundMoney(imponibile),
    iva: roundMoney(iva),
    totale: roundMoney(imponibile + iva),
  };
}

/** Aggrega importi riga: ammortizzabili vs resto, con IVA da aliquota documento. */
export function aggregateRigheConIva(
  righe: Array<{
    importo: number;
    isBeneAmmortizzabile: boolean;
    ivaPercentuale: number;
  }>
): { vocePrimaria: ImportoConIva; beniAmmortizzabili: ImportoConIva } {
  const primaria: ImportoConIva[] = [];
  const beni: ImportoConIva[] = [];
  for (const r of righe) {
    const row = toImportoConIva(r.importo, r.ivaPercentuale);
    if (r.isBeneAmmortizzabile) beni.push(row);
    else primaria.push(row);
  }
  return {
    vocePrimaria: sumImportiConIva(primaria),
    beniAmmortizzabili: sumImportiConIva(beni),
  };
}
