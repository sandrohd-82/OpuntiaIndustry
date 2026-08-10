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

export const graficiPeriodoSchema = z.object({
  anno: z.number().int().min(2000).max(2100),
  mese: z.number().int().min(1).max(12).nullable().optional(),
});

export const graficiOrdiniFiltroSchema = graficiPeriodoSchema.extend({
  prodottoId: z.string().uuid().nullable().optional(),
});

export const graficiIncassiFiltroSchema = graficiPeriodoSchema.extend({
  clienteId: z.string().uuid().nullable().optional(),
});

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
