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

export const MAPPA_SCALA_UNITA = ["cm", "m"] as const;
export type MappaScalaUnita = (typeof MAPPA_SCALA_UNITA)[number];

export type MappaPunto = { x: number; y: number };

export type MappaMagazzino = {
  id: string;
  nome: string;
  versione: number;
  documentoStato: MappaDocumentoStato;
  vistaEtichetta: string;
  scalaValore: number;
  scalaUnita: MappaScalaUnita;
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
  scalaValore: z.number().positive().max(10000),
  scalaUnita: z.enum(MAPPA_SCALA_UNITA),
  viewX: z.number().finite(),
  viewY: z.number().finite(),
  viewZoom: z.number().min(0.01).max(20),
  grigliaPx: z.number().positive().max(200).optional(),
  linee: z.array(mappaLineaInputSchema).max(2000),
});

export type SalvaMappaInput = z.infer<typeof salvaMappaSchema>;

export function snapToGrid(value: number, grid: number): number {
  if (grid <= 0) return value;
  return Math.round(value / grid) * grid;
}

export function parseScalaUnita(v: string): MappaScalaUnita {
  return v === "m" ? "m" : "cm";
}

export function quadratiTraPunti(
  x1: number,
  y1: number,
  x2: number,
  y2: number,
  griglia: number
): number {
  if (griglia <= 0) return 0;
  return Math.hypot(x2 - x1, y2 - y1) / griglia;
}

function formatNumeroMisura(n: number): string {
  const r = Math.round(n * 100) / 100;
  return r.toLocaleString("it-IT", { maximumFractionDigits: 2 });
}

export function formattaQuadrati(n: number): string {
  const r = Math.round(n * 10) / 10;
  if (Math.abs(r - Math.round(r)) < 0.05) return String(Math.round(r));
  return r.toLocaleString("it-IT", { maximumFractionDigits: 1 });
}

export function formattaLunghezzaReale(
  quadrati: number,
  valore: number,
  unita: MappaScalaUnita
): string {
  if (!(valore > 0) || !(quadrati > 0)) return "0";
  const raw = quadrati * valore;
  if (unita === "m") {
    if (raw >= 1) return `${formatNumeroMisura(raw)} m`;
    return `${formatNumeroMisura(raw * 100)} cm`;
  }
  if (raw >= 100) return `${formatNumeroMisura(raw / 100)} m`;
  return `${formatNumeroMisura(raw)} cm`;
}

export function formattaMisuraSegmento(
  x1: number,
  y1: number,
  x2: number,
  y2: number,
  griglia: number,
  valore: number,
  unita: MappaScalaUnita
): string {
  const q = quadratiTraPunti(x1, y1, x2, y2, griglia);
  if (q <= 0) return "";
  return `${formattaQuadrati(q)} quadrati · ${formattaLunghezzaReale(q, valore, unita)}`;
}

/** 0 = destra, 90 = basso, 180 = sinistra, 270 = alto (coordinate schermo). */
export function headingCardinale(from: MappaPunto, to: MappaPunto): number {
  const dx = to.x - from.x;
  const dy = to.y - from.y;
  if (Math.abs(dx) < 0.0001 && Math.abs(dy) < 0.0001) return 0;
  if (Math.abs(dx) >= Math.abs(dy)) return dx >= 0 ? 0 : 180;
  return dy >= 0 ? 90 : 270;
}

export function ruotaHeading(heading: number, senso: 1 | -1): number {
  return (((heading + 90 * senso) % 360) + 360) % 360;
}

export function puntoDopoQuadrati(
  from: MappaPunto,
  heading: number,
  quadrati: number,
  griglia: number
): MappaPunto {
  const rad = (heading * Math.PI) / 180;
  return {
    x: snapToGrid(from.x + Math.cos(rad) * quadrati * griglia, griglia),
    y: snapToGrid(from.y + Math.sin(rad) * quadrati * griglia, griglia),
  };
}

export function verticiRettangolo(
  origine: MappaPunto,
  heading0: number,
  latoA: number,
  latoB: number,
  senso: 1 | -1,
  griglia: number
): MappaPunto[] {
  const h1 = heading0;
  const h2 = ruotaHeading(h1, senso);
  const p1 = puntoDopoQuadrati(origine, h1, latoA, griglia);
  const p2 = puntoDopoQuadrati(p1, h2, latoB, griglia);
  const p3 = puntoDopoQuadrati(p2, ruotaHeading(h2, senso), latoA, griglia);
  return [origine, p1, p2, p3];
}

export const MAPPA_ZOOM_MIN = 0.01;
export const MAPPA_ZOOM_MAX = 8;
export const MAPPA_QUADRATI_MAX = 20000;

export type FoglioMappa = {
  x: number;
  y: number;
  width: number;
  height: number;
};

export function lunghezzaLineaPx(
  x1: number,
  y1: number,
  x2: number,
  y2: number
): number {
  return Math.hypot(x2 - x1, y2 - y1);
}

/** Il foglio cresce con la linea più lunga e contiene tutti i tratti. */
export function calcolaFoglioMappa(
  linee: { x1: number; y1: number; x2: number; y2: number }[],
  extraPunti: MappaPunto[],
  extraSegmenti: { x1: number; y1: number; x2: number; y2: number }[],
  griglia: number
): FoglioMappa {
  const g = griglia > 0 ? griglia : 20;
  const pad = Math.max(g * 2, 40);
  const minLato = g * 40;
  let longest = 0;
  const punti: MappaPunto[] = [...extraPunti];
  for (const l of linee) {
    punti.push({ x: l.x1, y: l.y1 }, { x: l.x2, y: l.y2 });
    longest = Math.max(longest, lunghezzaLineaPx(l.x1, l.y1, l.x2, l.y2));
  }
  for (const s of extraSegmenti) {
    punti.push({ x: s.x1, y: s.y1 }, { x: s.x2, y: s.y2 });
    longest = Math.max(longest, lunghezzaLineaPx(s.x1, s.y1, s.x2, s.y2));
  }
  const lato = Math.max(longest, minLato);
  let minX = 0;
  let minY = 0;
  let maxX = lato;
  let maxY = lato;
  for (const p of punti) {
    minX = Math.min(minX, p.x);
    minY = Math.min(minY, p.y);
    maxX = Math.max(maxX, p.x);
    maxY = Math.max(maxY, p.y);
  }
  minX -= pad;
  minY -= pad;
  maxX = Math.max(maxX + pad, minX + lato + pad);
  maxY = Math.max(maxY + pad, minY + lato + pad);
  return {
    x: minX,
    y: minY,
    width: maxX - minX,
    height: maxY - minY,
  };
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
