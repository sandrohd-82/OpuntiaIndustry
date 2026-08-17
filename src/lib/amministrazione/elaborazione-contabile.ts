import { z } from "zod";
import type {
  ElaborazioneContabileKind,
  ElaborazioneContabileRow,
  ElaborazioneContabileVoceRow,
} from "@/types/database";
import {
  dateRangeForTrimestre,
  labelTrimestre,
  type TrimestreNumero,
} from "@/lib/amministrazione/trimestre-commerciale";

export type ElaborazioneVoceInput = {
  fatturaId: string;
  numeraConVignetta: boolean;
};

export type ElaborazioneVoceView = {
  fatturaId: string;
  numeroInterno: string;
  dataEmissione: string;
  anagraficaRagioneSociale: string;
  anagraficaCodiceTarga: string;
  totale: number;
  numeraConVignetta: boolean;
  numeroVignetta: number | null;
};

export type ElaborazioneContabileView = {
  id: string | null;
  kind: ElaborazioneContabileKind;
  anno: number;
  trimestre: TrimestreNumero;
  labelTrimestre: string;
  documentoStato: string;
  versione: number;
  note: string;
  voci: ElaborazioneVoceView[];
};

export const elaborazioneSaveSchema = z.object({
  kind: z.enum(["emessa", "ricevuta"]),
  anno: z.number().int().min(2000).max(2100),
  trimestre: z.union([
    z.literal(1),
    z.literal(2),
    z.literal(3),
    z.literal(4),
  ]),
  note: z.string().max(2000).optional(),
  voci: z.array(
    z.object({
      fatturaId: z.string().uuid(),
      numeraConVignetta: z.boolean(),
    })
  ),
});

export type ElaborazioneSaveInput = z.infer<typeof elaborazioneSaveSchema>;

/** Assegna 1…X alle sole voci con vignetta, in ordine di data (già ordinate). */
export function assignNumeriVignetta(
  voci: Array<{ fatturaId: string; numeraConVignetta: boolean }>
): Array<{
  fatturaId: string;
  numeraConVignetta: boolean;
  numeroVignetta: number | null;
  sortOrder: number;
}> {
  let n = 0;
  return voci.map((v, i) => {
    const numeroVignetta = v.numeraConVignetta ? ++n : null;
    return {
      fatturaId: v.fatturaId,
      numeraConVignetta: v.numeraConVignetta,
      numeroVignetta,
      sortOrder: i,
    };
  });
}

export function buildElaborazioneView(params: {
  kind: ElaborazioneContabileKind;
  anno: number;
  trimestre: TrimestreNumero;
  elaborazione: ElaborazioneContabileRow | null;
  vociDb: ElaborazioneContabileVoceRow[];
  fatture: Array<{
    id: string;
    numeroInterno: string;
    dataEmissione: string;
    anagraficaRagioneSociale: string;
    anagraficaCodiceTarga: string;
    totale: number;
  }>;
}): ElaborazioneContabileView {
  const byFattura = new Map(
    params.vociDb
      .filter((v) => !v.deleted_at)
      .map((v) => [v.fattura_id, v] as const)
  );

  const voci: ElaborazioneVoceView[] = params.fatture.map((f) => {
    const saved = byFattura.get(f.id);
    return {
      fatturaId: f.id,
      numeroInterno: f.numeroInterno,
      dataEmissione: f.dataEmissione,
      anagraficaRagioneSociale: f.anagraficaRagioneSociale,
      anagraficaCodiceTarga: f.anagraficaCodiceTarga,
      totale: f.totale,
      numeraConVignetta: Boolean(saved?.numera_con_vignetta),
      numeroVignetta: saved?.numero_vignetta ?? null,
    };
  });

  // Ricalcola preview vignette in memoria (ordine già crescente per data)
  const numbered = assignNumeriVignetta(
    voci.map((v) => ({
      fatturaId: v.fatturaId,
      numeraConVignetta: v.numeraConVignetta,
    }))
  );
  const numMap = new Map(numbered.map((n) => [n.fatturaId, n.numeroVignetta]));

  return {
    id: params.elaborazione?.id ?? null,
    kind: params.kind,
    anno: params.anno,
    trimestre: params.trimestre,
    labelTrimestre: labelTrimestre(params.anno, params.trimestre),
    documentoStato: params.elaborazione?.documento_stato ?? "bozza",
    versione: params.elaborazione?.versione ?? 1,
    note: params.elaborazione?.note ?? "",
    voci: voci.map((v) => ({
      ...v,
      numeroVignetta: v.numeraConVignetta
        ? (numMap.get(v.fatturaId) ?? null)
        : null,
    })),
  };
}

export function trimestreBounds(anno: number, trim: TrimestreNumero) {
  return dateRangeForTrimestre(anno, trim);
}
