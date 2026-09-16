import { z } from "zod";

export const MAPPA_STATI = ["bozza", "approvato", "chiuso"] as const;
export type MappaDocumentoStato = (typeof MAPPA_STATI)[number];

export const MAPPA_STATO_LABEL: Record<MappaDocumentoStato, string> = {
  bozza: "Bozza",
  approvato: "Approvato",
  chiuso: "Chiuso",
};

export type MappaLinea = {
  id: string;
  x1: number;
  y1: number;
  x2: number;
  y2: number;
  spessore: number;
  colore: string;
  sortOrder: number;
};

export const MAPPA_LINEA_COLORE_DEFAULT = "#0f172a";

export const MAPPA_LINEA_COLORI = [
  "#0f172a",
  "#b91c1c",
  "#1d4ed8",
  "#15803d",
  "#a16207",
  "#7c3aed",
  "#c2410c",
  "#0f766e",
] as const;

export function normalizzaColoreLinea(value: string): string {
  const t = value.trim();
  if (/^#[0-9A-Fa-f]{6}$/.test(t)) return t.toLowerCase();
  if (/^#[0-9A-Fa-f]{3}$/.test(t)) {
    return `#${t[1]}${t[1]}${t[2]}${t[2]}${t[3]}${t[3]}`.toLowerCase();
  }
  return MAPPA_LINEA_COLORE_DEFAULT;
}

export type MappaMagazzino = {
  id: string;
  nome: string;
  versione: number;
  documentoStato: MappaDocumentoStato;
  vistaEtichetta: string;
  viewX: number;
  viewY: number;
  viewZoom: number;
  grigliaPx: number;
  note: string;
  approvedAt: string | null;
  linee: MappaLinea[];
};

export const MAPPA_VISTA_SUGGERITE = [
  "Dall'alto",
  "Lato fronte",
  "Lato Dx",
  "Lato Sx",
  "Retro",
] as const;

export const mappaLineaInputSchema = z.object({
  id: z.string().uuid().optional(),
  x1: z.number().finite(),
  y1: z.number().finite(),
  x2: z.number().finite(),
  y2: z.number().finite(),
  spessore: z.number().positive().max(80),
  colore: z
    .string()
    .trim()
    .optional()
    .transform((v) => normalizzaColoreLinea(v ?? MAPPA_LINEA_COLORE_DEFAULT)),
  sortOrder: z.number().int().nonnegative().optional(),
});

export const salvaMappaSchema = z.object({
  mappaId: z.string().uuid(),
  nome: z.string().trim().min(1).max(120).optional(),
  vistaEtichetta: z.string().trim().max(80),
  viewX: z.number().finite(),
  viewY: z.number().finite(),
  viewZoom: z.number().positive().max(20),
  grigliaPx: z.number().positive().max(200).optional(),
  linee: z.array(mappaLineaInputSchema).max(2000),
});

export type SalvaMappaInput = z.infer<typeof salvaMappaSchema>;

export function snapToGrid(value: number, grid: number): number {
  if (grid <= 0) return value;
  return Math.round(value / grid) * grid;
}

export function distanzaPuntoSegmento(
  px: number,
  py: number,
  x1: number,
  y1: number,
  x2: number,
  y2: number
): number {
  const dx = x2 - x1;
  const dy = y2 - y1;
  const len2 = dx * dx + dy * dy;
  if (len2 === 0) return Math.hypot(px - x1, py - y1);
  let t = ((px - x1) * dx + (py - y1) * dy) / len2;
  t = Math.max(0, Math.min(1, t));
  return Math.hypot(px - (x1 + t * dx), py - (y1 + t * dy));
}
