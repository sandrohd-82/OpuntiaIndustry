import { z } from "zod";

export const MESI_IT = [
  "Gen",
  "Feb",
  "Mar",
  "Apr",
  "Mag",
  "Giu",
  "Lug",
  "Ago",
  "Set",
  "Ott",
  "Nov",
  "Dic",
] as const;

export type GraficiSerieMese = {
  mese: number; // 1-12
  label: string;
  valore: number;
};

export type GraficiKpi = {
  totale: number;
  serie: GraficiSerieMese[];
  anno: number;
};

export type GraficiFonteIncassi = "fatture" | "ordini" | "entrambi";

export type GraficiAndamento = "crescita" | "stabile" | "calo" | "n/d";

export type GraficiMultiAnno = {
  seriePerAnno: GraficiKpi[];
  andamento: GraficiAndamento;
  variazionePct: number | null;
  notaAndamento: string;
};

/** Sentinel: tutto lo storico (nessun filtro anno). */
export const ANNO_INTERA_VITA = 0;

export const graficiPeriodoSchema = z.object({
  /** Anno solare, oppure `ANNO_INTERA_VITA` (0) = intera vita. */
  anno: z.union([
    z.literal(ANNO_INTERA_VITA),
    z.number().int().min(2000).max(2100),
  ]),
  mese: z.number().int().min(1).max(12).nullable().optional(),
});

export const graficiOrdiniFiltroSchema = graficiPeriodoSchema.extend({
  prodottoId: z.string().uuid().nullable().optional(),
  clienteId: z.string().uuid().nullable().optional(),
  anniConfronto: z.array(z.number().int().min(2000).max(2100)).optional(),
});

export const graficiIncassiFiltroSchema = graficiPeriodoSchema.extend({
  clienteId: z.string().uuid().nullable().optional(),
  fonte: z.enum(["fatture", "ordini", "entrambi"]).optional(),
  anniConfronto: z.array(z.number().int().min(2000).max(2100)).optional(),
});

export function isInteraVita(anno: number): boolean {
  return anno === ANNO_INTERA_VITA;
}

export function labelPeriodoAnno(anno: number): string {
  return isInteraVita(anno) ? "Intera vita" : `Anno ${anno}`;
}

export type GraficiOrdiniFiltro = z.infer<typeof graficiOrdiniFiltroSchema>;
export type GraficiIncassiFiltro = z.infer<typeof graficiIncassiFiltroSchema>;

export function emptySerieAnno(anno: number): GraficiKpi {
  return {
    anno,
    totale: 0,
    serie: MESI_IT.map((label, i) => ({
      mese: i + 1,
      label,
      valore: 0,
    })),
  };
}

export function currentAnno(): number {
  return new Date().getFullYear();
}

/** Anni selezionabili nei filtri (anno corrente e 7 precedenti). */
export function anniDisponibili(now = new Date()): number[] {
  const y = now.getFullYear();
  return Array.from({ length: 8 }, (_, i) => y - i);
}

export function formatQty(value: number): string {
  return value.toLocaleString("it-IT", {
    maximumFractionDigits: 2,
  });
}

export function formatEuro(value: number): string {
  return value.toLocaleString("it-IT", {
    style: "currency",
    currency: "EUR",
  });
}

export function labelAndamento(a: GraficiAndamento): string {
  if (a === "crescita") return "In crescita";
  if (a === "calo") return "In calo";
  if (a === "stabile") return "Stabile";
  return "N/D";
}

/** Confronta totale anno più recente vs precedente (≥5% = crescita/calo). */
export function calcolaAndamentoMultiAnno(
  seriePerAnno: GraficiKpi[]
): Pick<GraficiMultiAnno, "andamento" | "variazionePct" | "notaAndamento"> {
  const sorted = [...seriePerAnno].sort((a, b) => b.anno - a.anno);
  if (sorted.length < 2) {
    return {
      andamento: "n/d",
      variazionePct: null,
      notaAndamento: "Seleziona almeno due anni per il confronto andamento.",
    };
  }
  const ultimo = sorted[0];
  const prec = sorted[1];
  if (prec.totale === 0 && ultimo.totale === 0) {
    return {
      andamento: "stabile",
      variazionePct: 0,
      notaAndamento: `Nessun valore in ${prec.anno} e ${ultimo.anno}.`,
    };
  }
  if (prec.totale === 0) {
    return {
      andamento: "crescita",
      variazionePct: null,
      notaAndamento: `Da 0 a ${ultimo.anno}: crescita (base ${prec.anno} nulla).`,
    };
  }
  const pct = ((ultimo.totale - prec.totale) / prec.totale) * 100;
  const andamento: GraficiAndamento =
    pct > 5 ? "crescita" : pct < -5 ? "calo" : "stabile";
  return {
    andamento,
    variazionePct: Math.round(pct * 10) / 10,
    notaAndamento: `${ultimo.anno} vs ${prec.anno}: ${pct >= 0 ? "+" : ""}${pct.toFixed(1)}% (${labelAndamento(andamento)}).`,
  };
}

export const COLORI_ANNI = [
  "#0f766e",
  "#b45309",
  "#1d4ed8",
  "#be123c",
  "#7c3aed",
  "#065f46",
  "#9a3412",
  "#334155",
] as const;

/** Palette aziende (stabile per indice). */
export const COLORI_AZIENDE = [
  "#0f766e",
  "#b45309",
  "#1d4ed8",
  "#be123c",
  "#7c3aed",
  "#0891b2",
  "#ca8a04",
  "#c2410c",
  "#4d7c0f",
  "#9333ea",
  "#0e7490",
  "#a16207",
  "#9f1239",
  "#166534",
  "#1e3a8a",
  "#7c2d12",
] as const;

export type GraficiAziendaMeta = {
  id: string;
  label: string;
  codiceTarga: string;
  color: string;
};

export type GraficiMeseStacked = {
  mese: number;
  label: string;
  totale: number;
  /** Importi per azienda (stesso ordine di `aziende`). */
  perAzienda: number[];
};

export type GraficiProdottoSlice = {
  codice: string;
  label: string;
  valore: number;
  color: string;
};

export type GraficiIncassiDettaglio = {
  anno: number;
  totale: number;
  aziende: GraficiAziendaMeta[];
  mesi: GraficiMeseStacked[];
  /** Serie mensile per azienda (12 valori, 0 se nessun incasso). */
  andamentoAziende: Array<{
    aziendaId: string;
    label: string;
    color: string;
    valori: number[];
  }>;
  prodotti: GraficiProdottoSlice[];
};

export function coloreAziendaByIndex(index: number): string {
  return COLORI_AZIENDE[index % COLORI_AZIENDE.length];
}

/** Importo per esteso (senza abbreviazione “k”). */
export function formatEuroCompact(value: number): string {
  return formatEuro(value);
}
