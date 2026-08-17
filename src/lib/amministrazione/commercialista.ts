import { z } from "zod";
import type { TrimestreNumero } from "@/lib/amministrazione/trimestre-commerciale";
import {
  dateRangeForTrimestre,
  labelTrimestre,
} from "@/lib/amministrazione/trimestre-commerciale";

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

export type CommercialistaColonnaTotali = {
  totaleDocumenti: number;
  vocePrimaria: number;
  beniAmmortizzabili: number;
  conteggioDocumenti: number;
};

export type CommercialistaSummary = {
  anno: number;
  trimestre: TrimestreNumero;
  labelTrimestre: string;
  dal: string;
  al: string;
  emesse: CommercialistaColonnaTotali;
  ricevute: CommercialistaColonnaTotali;
};

export function emptyColonna(): CommercialistaColonnaTotali {
  return {
    totaleDocumenti: 0,
    vocePrimaria: 0,
    beniAmmortizzabili: 0,
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

/** Aggrega importi riga: ammortizzabili vs resto (prodotti / materiale consumo). */
export function aggregateRigheImporti(
  righe: Array<{ importo: number; isBeneAmmortizzabile: boolean }>
): { vocePrimaria: number; beniAmmortizzabili: number } {
  let vocePrimaria = 0;
  let beniAmmortizzabili = 0;
  for (const r of righe) {
    const importo = Number(r.importo) || 0;
    if (r.isBeneAmmortizzabile) beniAmmortizzabili += importo;
    else vocePrimaria += importo;
  }
  return { vocePrimaria, beniAmmortizzabili };
}
