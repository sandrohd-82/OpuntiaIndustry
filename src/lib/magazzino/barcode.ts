import { z } from "zod";
import type { MagazzinoCatalogKind, MagazzinoUnita } from "@/lib/magazzino/types";

export const barcodeStringSchema = z
  .string()
  .trim()
  .min(1, "Barcode obbligatorio.")
  .max(128, "Barcode troppo lungo.");

export const associateBarcodeSchema = z.object({
  barcode: barcodeStringSchema,
  catalogKind: z.enum(["materia_prima", "prodotto_fornitore"]),
  prodottoId: z.string().uuid(),
});

export const createFromBarcodeSchema = z.object({
  barcode: barcodeStringSchema,
  catalogKind: z.enum(["materia_prima", "prodotto_fornitore"]),
  nome: z.string().trim().min(1).max(200),
  schedaProvvisoria: z.boolean().default(true),
  categoriaUtilizzo: z
    .enum(["mat_consumo", "mat_poco_consumo", "acquisti_occasionali"])
    .default("mat_consumo"),
  unita: z.enum(["kg", "pz"]).default("pz"),
});

export const movimentoScanSchema = z.object({
  barcode: barcodeStringSchema,
  mode: z.enum(["carico", "scarico"]),
  quantita: z.number().positive().max(1_000_000),
  unita: z.enum(["kg", "pz"]).default("pz"),
  note: z.string().trim().max(500).optional(),
});

export const setArticoloBarcodeSchema = z.object({
  catalogKind: z.enum(["materia_prima", "prodotto_fornitore"]),
  prodottoId: z.string().uuid(),
  barcode: barcodeStringSchema.nullable(),
  schedaProvvisoria: z.boolean().optional(),
});

export const resolveSchedaProvvisoriaSchema = z.object({
  catalogKind: z.enum(["materia_prima", "prodotto_fornitore"]),
  prodottoId: z.string().uuid(),
});

export type BarcodeLookupHit = {
  catalogKind: MagazzinoCatalogKind;
  prodottoId: string;
  codice: string;
  nome: string;
  barcode: string;
  schedaProvvisoria: boolean;
  categoriaUtilizzo: string | null;
  giacenza: number;
  unita: MagazzinoUnita;
};

export function buildBarcodeFromModel(parts: {
  data?: string;
  categoria?: string;
  fase?: string;
  parametro?: string;
  progressivo?: string;
}): string {
  const chunks = [
    parts.data?.trim(),
    parts.categoria?.trim(),
    parts.fase?.trim(),
    parts.parametro?.trim(),
    parts.progressivo?.trim(),
  ].filter(Boolean);
  return chunks.join("/");
}

export function suggestProvisionalCode(
  kind: MagazzinoCatalogKind,
  nome: string
): string {
  const prefix = kind === "materia_prima" ? "MpTmp" : "PrTmp";
  const initials = nome
    .replace(/[^a-zA-Z0-9]+/g, "")
    .slice(0, 3)
    .toUpperCase()
    .padEnd(3, "X");
  const stamp = Date.now().toString(36).slice(-4).toUpperCase();
  return `${prefix}${initials}/${stamp}`;
}
