import { z } from "zod";
import {
  mappaAreaInputSchema,
  type MappaAreaDisegnata,
  type UbicazioneElenco,
} from "@/lib/magazzino/ubicazioni";
import {
  mappaRiferimentoGruppoInputSchema,
  type MappaRiferimentoGruppo,
} from "@/lib/magazzino/riferimenti";

export const MAPPA_STATI = ["bozza", "approvato", "chiuso"] as const;
export type MappaDocumentoStato = (typeof MAPPA_STATI)[number];

export const MAPPA_STATO_LABEL: Record<MappaDocumentoStato, string> = {
  bozza: "Bozza",
  approvato: "Collegata",
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

export const MAPPA_LINEA_PALETTE: { hex: string; nome: string }[] = [
  { hex: "#0f172a", nome: "Nero scaffale" },
  { hex: "#334155", nome: "Ardesia" },
  { hex: "#64748b", nome: "Grigio" },
  { hex: "#94a3b8", nome: "Grigio chiaro" },
  { hex: "#b91c1c", nome: "Rosso" },
  { hex: "#e11d48", nome: "Rosso rosa" },
  { hex: "#db2777", nome: "Fucsia" },
  { hex: "#c026d3", nome: "Magenta" },
  { hex: "#7c3aed", nome: "Viola" },
  { hex: "#4f46e5", nome: "Indaco" },
  { hex: "#1d4ed8", nome: "Blu" },
  { hex: "#0284c7", nome: "Blu cielo" },
  { hex: "#0ea5e9", nome: "Azzurro" },
  { hex: "#06b6d4", nome: "Ciano" },
  { hex: "#0f766e", nome: "Teal" },
  { hex: "#0d9488", nome: "Turchese" },
  { hex: "#15803d", nome: "Verde" },
  { hex: "#16a34a", nome: "Verde prato" },
  { hex: "#84cc16", nome: "Lime" },
  { hex: "#eab308", nome: "Giallo" },
  { hex: "#facc15", nome: "Giallo sicurezza" },
  { hex: "#f59e0b", nome: "Ambra" },
  { hex: "#c2410c", nome: "Arancio" },
  { hex: "#ea580c", nome: "Arancio cantiere" },
  { hex: "#a16207", nome: "Ocra" },
  { hex: "#78716c", nome: "Talpa" },
  { hex: "#be123c", nome: "Bordeaux" },
];

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
  areaCodice: string;
  luogoNome: string;
  menuNodoId: string | null;
  percorsoEtichetta: string;
  slug: string | null;
  vistaEtichetta: string;
  scalaValore: number;
  scalaUnita: MappaScalaUnita;
  viewX: number;
  viewY: number;
  viewZoom: number;
  grigliaPx: number;
  note: string;
  approvedAt: string | null;
  collegataAt: string | null;
  linee: MappaLinea[];
  aree: MappaAreaDisegnata[];
  ubicazioni: UbicazioneElenco[];
  riferimenti: MappaRiferimentoGruppo[];
};

export type MappaElencoItem = {
  id: string;
  nome: string;
  versione: number;
  documentoStato: MappaDocumentoStato;
  luogoNome: string;
  luogoSlug: string | null;
  slug: string | null;
  vistaEtichetta: string;
  updatedAt: string;
};

export type PiantaLuogoPagina = {
  nodoId: string;
  slug: string;
  etichetta: string;
  percorsoEtichetta: string;
  areaSlug: string;
  mappe: MappaMagazzino[];
};

export type MappaNavItem = {
  slug: string;
  luogoNome: string;
  vistaEtichetta: string;
  viste: number;
};

export function slugMappaArea(luogo: string, vista: string): string {
  const base = `${luogo}-${vista}`
    .normalize("NFD")
    .replace(/\p{M}/gu, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 72);
  return base || "mappa";
}

export function etichettaMappaCollegata(luogo: string, vista: string): string {
  return `${luogo.trim()} [${vista.trim()}]`;
}

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
  spessore: z.number().positive(),
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
  aree: z.array(mappaAreaInputSchema).max(500).optional(),
  riferimenti: z.array(mappaRiferimentoGruppoInputSchema).max(50).optional(),
});

export {
  collegaMappaPercorsoSchema as collegaMappaSchema,
  rinominaPercorsoMappaSchema,
} from "@/lib/magazzino/menu-mappa";
export type {
  CollegaMappaPercorsoInput as CollegaMappaInput,
  RinominaPercorsoMappaInput,
} from "@/lib/magazzino/menu-mappa";

export const creaMappaBozzaSchema = z.object({
  nome: z.string().trim().min(1).max(120).optional(),
});

export const salvaNomeAreaMappaSchema = z.object({
  mappaId: z.string().uuid(),
  nomeArea: z.string().trim().min(1).max(120),
});

export type SalvaNomeAreaMappaInput = z.infer<typeof salvaNomeAreaMappaSchema>;

export type SalvaMappaInput = z.infer<typeof salvaMappaSchema>;
export type CreaMappaBozzaInput = z.infer<typeof creaMappaBozzaSchema>;

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

export function formattaMisuraQuadrati(
  quadrati: number,
  valore: number,
  unita: MappaScalaUnita
): string {
  const q = Math.max(0, quadrati);
  const reale =
    q > 0 ? formattaLunghezzaReale(q, valore, unita) : `0 ${unita}`;
  return `${formattaQuadrati(q)} q · ${reale}`;
}

export function passoRighelloQuadrati(griglia: number, zoom: number): number {
  const pxPerQuad = Math.max(griglia * zoom, 0.001);
  const raw = 56 / pxPerQuad;
  const nice = [1, 2, 5, 10, 20, 50, 100, 200, 500, 1000, 2000, 5000, 10000];
  return nice.find((n) => n >= raw) ?? nice[nice.length - 1]!;
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

export function verticiRettangoloDaAngoli(
  a: MappaPunto,
  b: MappaPunto,
  griglia: number
): MappaPunto[] {
  const x1 = snapToGrid(a.x, griglia);
  const y1 = snapToGrid(a.y, griglia);
  const x2 = snapToGrid(b.x, griglia);
  const y2 = snapToGrid(b.y, griglia);
  return [
    { x: x1, y: y1 },
    { x: x2, y: y1 },
    { x: x2, y: y2 },
    { x: x1, y: y2 },
  ];
}

export type SegnoAsse = 1 | -1;

export function segniRettangolo(from: MappaPunto, to: MappaPunto): {
  sx: SegnoAsse;
  sy: SegnoAsse;
} {
  return {
    sx: to.x < from.x ? -1 : 1,
    sy: to.y < from.y ? -1 : 1,
  };
}

export function etichettaSensoRettangolo(sx: SegnoAsse, sy: SegnoAsse): string {
  return `${sx < 0 ? "sinistra" : "destra"} e ${sy < 0 ? "alto" : "basso"}`;
}

export function puntoOppostoRettangolo(
  origin: MappaPunto,
  sx: SegnoAsse,
  sy: SegnoAsse,
  wQ: number,
  hQ: number,
  griglia: number
): MappaPunto {
  return {
    x: origin.x + sx * Math.max(1, wQ) * griglia,
    y: origin.y + sy * Math.max(1, hQ) * griglia,
  };
}

export function rettangoloHaArea(a: MappaPunto, b: MappaPunto, griglia: number): boolean {
  return (
    Math.abs(a.x - b.x) >= griglia * 0.5 && Math.abs(a.y - b.y) >= griglia * 0.5
  );
}

export type LatoRettangolo = "left" | "right" | "up" | "down";

export const LATO_RETTANGOLO_LABEL: Record<LatoRettangolo, string> = {
  left: "Sinistra",
  right: "Destra",
  up: "Alto",
  down: "Basso",
};

export type MappaBox = {
  x: number;
  y: number;
  width: number;
  height: number;
};

export type MappaRettangoloAsse = MappaBox & {
  lineIds: string[];
};

function sameN(a: number, b: number, eps: number): boolean {
  return Math.abs(a - b) <= eps;
}

export function asseLineaOrtogonale(
  l: Pick<MappaLinea, "x1" | "y1" | "x2" | "y2">,
  eps: number
): "h" | "v" | null {
  if (sameN(l.y1, l.y2, eps) && !sameN(l.x1, l.x2, eps)) return "h";
  if (sameN(l.x1, l.x2, eps) && !sameN(l.y1, l.y2, eps)) return "v";
  return null;
}

export function elencoRettangoliDaLinee(
  linee: MappaLinea[],
  eps: number
): MappaRettangoloAsse[] {
  const hv = linee
    .map((l) => ({ l, asse: asseLineaOrtogonale(l, eps) }))
    .filter((x): x is { l: MappaLinea; asse: "h" | "v" } => Boolean(x.asse));
  const horiz = hv.filter((x) => x.asse === "h").map((x) => x.l);
  const vert = hv.filter((x) => x.asse === "v").map((x) => x.l);
  const seen = new Set<string>();
  const out: MappaRettangoloAsse[] = [];

  for (let i = 0; i < horiz.length; i += 1) {
    const a = horiz[i]!;
    const ax1 = Math.min(a.x1, a.x2);
    const ax2 = Math.max(a.x1, a.x2);
    const ay = (a.y1 + a.y2) / 2;
    for (let j = i + 1; j < horiz.length; j += 1) {
      const b = horiz[j]!;
      const bx1 = Math.min(b.x1, b.x2);
      const bx2 = Math.max(b.x1, b.x2);
      const by = (b.y1 + b.y2) / 2;
      if (sameN(ay, by, eps)) continue;
      if (!sameN(ax1, bx1, eps) || !sameN(ax2, bx2, eps)) continue;
      const x1 = (ax1 + bx1) / 2;
      const x2 = (ax2 + bx2) / 2;
      const y1 = Math.min(ay, by);
      const y2 = Math.max(ay, by);
      if (x2 - x1 < eps || y2 - y1 < eps) continue;
      const left = vert.find(
        (v) =>
          sameN((v.x1 + v.x2) / 2, x1, eps) &&
          sameN(Math.min(v.y1, v.y2), y1, eps) &&
          sameN(Math.max(v.y1, v.y2), y2, eps)
      );
      const right = vert.find(
        (v) =>
          sameN((v.x1 + v.x2) / 2, x2, eps) &&
          sameN(Math.min(v.y1, v.y2), y1, eps) &&
          sameN(Math.max(v.y1, v.y2), y2, eps)
      );
      if (!left || !right || left.id === right.id) continue;
      const lineIds = [a.id, b.id, left.id, right.id];
      const key = [...lineIds].sort().join("|");
      if (seen.has(key)) continue;
      seen.add(key);
      out.push({
        lineIds,
        x: x1,
        y: y1,
        width: x2 - x1,
        height: y2 - y1,
      });
    }
  }
  return out;
}

export function rettangoloDaLinea(
  linee: MappaLinea[],
  seedId: string,
  eps: number
): MappaRettangoloAsse | null {
  return (
    elencoRettangoliDaLinee(linee, eps).find((r) => r.lineIds.includes(seedId)) ??
    null
  );
}

export function hitRettangoloLinee(
  wx: number,
  wy: number,
  linee: MappaLinea[],
  eps: number,
  bordoTol: number
): MappaRettangoloAsse | null {
  let best: { r: MappaRettangoloAsse; area: number } | null = null;
  for (const r of elencoRettangoliDaLinee(linee, eps)) {
    const inside =
      wx >= r.x - bordoTol &&
      wx <= r.x + r.width + bordoTol &&
      wy >= r.y - bordoTol &&
      wy <= r.y + r.height + bordoTol;
    if (!inside) continue;
    const area = r.width * r.height;
    if (!best || area < best.area) best = { r, area };
  }
  return best?.r ?? null;
}

export function classificaLatoRettangolo(
  l: Pick<MappaLinea, "x1" | "y1" | "x2" | "y2">,
  box: MappaBox
): LatoRettangolo {
  const midX = (l.x1 + l.x2) / 2;
  const midY = (l.y1 + l.y2) / 2;
  const horiz = Math.abs(l.y1 - l.y2) <= Math.abs(l.x1 - l.x2);
  if (horiz) {
    return Math.abs(midY - box.y) <= Math.abs(midY - (box.y + box.height))
      ? "up"
      : "down";
  }
  return Math.abs(midX - box.x) <= Math.abs(midX - (box.x + box.width))
    ? "left"
    : "right";
}

export function coordsLatoRettangolo(
  box: MappaBox,
  lato: LatoRettangolo
): { x1: number; y1: number; x2: number; y2: number } {
  const { x, y, width, height } = box;
  if (lato === "up") return { x1: x, y1: y, x2: x + width, y2: y };
  if (lato === "down") {
    return { x1: x + width, y1: y + height, x2: x, y2: y + height };
  }
  if (lato === "right") {
    return { x1: x + width, y1: y, x2: x + width, y2: y + height };
  }
  return { x1: x, y1: y + height, x2: x, y2: y };
}

export function aggiornaLineeRettangolo(
  linee: MappaLinea[],
  rect: MappaRettangoloAsse,
  box: MappaBox
): MappaLinea[] {
  const ids = new Set(rect.lineIds);
  const oldBox: MappaBox = {
    x: rect.x,
    y: rect.y,
    width: rect.width,
    height: rect.height,
  };
  return linee.map((l) => {
    if (!ids.has(l.id)) return l;
    return { ...l, ...coordsLatoRettangolo(box, classificaLatoRettangolo(l, oldBox)) };
  });
}

export function handlePuntiRettangolo(
  box: MappaBox
): { lato: LatoRettangolo; x: number; y: number }[] {
  return [
    { lato: "up", x: box.x + box.width / 2, y: box.y },
    { lato: "down", x: box.x + box.width / 2, y: box.y + box.height },
    { lato: "left", x: box.x, y: box.y + box.height / 2 },
    { lato: "right", x: box.x + box.width, y: box.y + box.height / 2 },
  ];
}

export function boxDaCursoreLato(
  orig: MappaBox,
  lato: LatoRettangolo,
  cursor: MappaPunto,
  griglia: number
): MappaBox {
  const g = Math.max(1, griglia);
  if (lato === "right") {
    const x2 = snapToGrid(cursor.x, g);
    return { ...orig, width: Math.max(g, x2 - orig.x) };
  }
  if (lato === "left") {
    const right = orig.x + orig.width;
    const x1 = snapToGrid(cursor.x, g);
    const width = Math.max(g, right - x1);
    return { x: right - width, y: orig.y, width, height: orig.height };
  }
  if (lato === "down") {
    const y2 = snapToGrid(cursor.y, g);
    return { ...orig, height: Math.max(g, y2 - orig.y) };
  }
  const bottom = orig.y + orig.height;
  const y1 = snapToGrid(cursor.y, g);
  const height = Math.max(g, bottom - y1);
  return { x: orig.x, y: bottom - height, width: orig.width, height };
}

export function ridimensionaBoxDaLato(
  box: MappaBox,
  lato: LatoRettangolo,
  misuraPx: number
): MappaBox {
  const misura = Math.max(1, misuraPx);
  if (lato === "right") return { ...box, width: misura };
  if (lato === "left") {
    return {
      x: box.x + box.width - misura,
      y: box.y,
      width: misura,
      height: box.height,
    };
  }
  if (lato === "down") return { ...box, height: misura };
  return {
    x: box.x,
    y: box.y + box.height - misura,
    width: box.width,
    height: misura,
  };
}

export function clampBoxNelFoglio(
  box: MappaBox,
  foglio: FoglioMappa,
  griglia: number
): MappaBox {
  const g = Math.max(1, griglia);
  let { x, y, width, height } = box;
  width = Math.max(g, width);
  height = Math.max(g, height);
  const maxX = foglio.x + foglio.width;
  const maxY = foglio.y + foglio.height;
  if (x < foglio.x) {
    width -= foglio.x - x;
    x = foglio.x;
  }
  if (y < foglio.y) {
    height -= foglio.y - y;
    y = foglio.y;
  }
  if (x + width > maxX) width = maxX - x;
  if (y + height > maxY) height = maxY - y;
  width = Math.max(g, snapToGrid(width, g));
  height = Math.max(g, snapToGrid(height, g));
  x = snapToGrid(x, g);
  y = snapToGrid(y, g);
  if (x + width > maxX) x = snapToGrid(maxX - width, g);
  if (y + height > maxY) y = snapToGrid(maxY - height, g);
  if (x < foglio.x) x = foglio.x;
  if (y < foglio.y) y = foglio.y;
  return { x, y, width: Math.max(g, width), height: Math.max(g, height) };
}

export function clampPuntoNelFoglio(
  p: MappaPunto,
  foglio: FoglioMappa,
  griglia: number
): MappaPunto {
  const minX = foglio.x;
  const maxX = foglio.x + foglio.width;
  const minY = foglio.y;
  const maxY = foglio.y + foglio.height;
  const x = snapToGrid(Math.min(maxX, Math.max(minX, p.x)), griglia);
  const y = snapToGrid(Math.min(maxY, Math.max(minY, p.y)), griglia);
  return {
    x: Math.min(maxX, Math.max(minX, x)),
    y: Math.min(maxY, Math.max(minY, y)),
  };
}

export const MAPPA_ZOOM_MIN = 0.01;
export const MAPPA_ZOOM_MAX = 8;
export const MAPPA_QUADRATI_MAX = 20000;
/** Margine su ogni lato: 5% della linea (o del lato) più lungo. */
export const MAPPA_RITAGLIO_PADDING_PX = 10;

export const MAPPA_FOGLIO_MARGINE_PCT = 0.05;
export const MAPPA_FOGLIO_MIN_QUADRATI = 40;

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

/**
 * Foglio quadrato che racchiude tutto il disegno.
 * Margine = 5% della lunghezza massima, su ogni lato (laterale, sopra e sotto).
 */
export function ritaglioDisegnoMappa(
  linee: { x1: number; y1: number; x2: number; y2: number }[],
  aree: { x: number; y: number; width: number; height: number }[],
  extraPunti: MappaPunto[] = [],
  padding = MAPPA_RITAGLIO_PADDING_PX
): FoglioMappa {
  let minX = Number.POSITIVE_INFINITY;
  let minY = Number.POSITIVE_INFINITY;
  let maxX = Number.NEGATIVE_INFINITY;
  let maxY = Number.NEGATIVE_INFINITY;
  let has = false;
  function add(x: number, y: number) {
    has = true;
    minX = Math.min(minX, x);
    minY = Math.min(minY, y);
    maxX = Math.max(maxX, x);
    maxY = Math.max(maxY, y);
  }
  for (const l of linee) {
    add(l.x1, l.y1);
    add(l.x2, l.y2);
  }
  for (const a of aree) {
    add(a.x, a.y);
    add(a.x + a.width, a.y + a.height);
  }
  for (const p of extraPunti) add(p.x, p.y);
  if (!has) {
    return { x: 0, y: 0, width: 80, height: 80 };
  }
  const pad = Math.max(0, padding);
  return {
    x: minX - pad,
    y: minY - pad,
    width: Math.max(1, maxX - minX + pad * 2),
    height: Math.max(1, maxY - minY + pad * 2),
  };
}

/** 1–2 viste: 33% ciascuna, blocco centrato. 3: 33% a riga. 4: 50% su due righe. */
export function classiGrigliaViste(n: number): { contenitore: string; cella: string } {
  if (n <= 1) {
    return {
      contenitore: "grid grid-cols-6 gap-3",
      cella: "col-span-2 col-start-3 min-h-64",
    };
  }
  if (n === 2) {
    return {
      contenitore: "grid grid-cols-6 gap-3",
      cella: "col-span-2 min-h-64 first:col-start-2",
    };
  }
  if (n === 3) {
    return { contenitore: "grid grid-cols-1 gap-3 md:grid-cols-3", cella: "min-h-64" };
  }
  if (n === 4) {
    return { contenitore: "grid grid-cols-1 gap-3 md:grid-cols-2", cella: "min-h-72" };
  }
  if (n <= 6) {
    return { contenitore: "grid grid-cols-1 gap-3 md:grid-cols-3", cella: "min-h-64" };
  }
  return { contenitore: "grid grid-cols-1 gap-3 md:grid-cols-2", cella: "min-h-64" };
}

export function calcolaFoglioMappa(
  linee: { x1: number; y1: number; x2: number; y2: number }[],
  extraSegmenti: { x1: number; y1: number; x2: number; y2: number }[],
  extraPunti: MappaPunto[],
  griglia: number,
  latoMinimoPx = 0
): FoglioMappa {
  const g = griglia > 0 ? griglia : 20;
  const minLato = MAPPA_FOGLIO_MIN_QUADRATI * g;
  let minX = Number.POSITIVE_INFINITY;
  let minY = Number.POSITIVE_INFINITY;
  let maxX = Number.NEGATIVE_INFINITY;
  let maxY = Number.NEGATIVE_INFINITY;
  let longest = Math.max(0, latoMinimoPx);
  let has = false;
  function addPunto(x: number, y: number) {
    has = true;
    minX = Math.min(minX, x);
    minY = Math.min(minY, y);
    maxX = Math.max(maxX, x);
    maxY = Math.max(maxY, y);
  }
  function addSeg(x1: number, y1: number, x2: number, y2: number) {
    addPunto(x1, y1);
    addPunto(x2, y2);
    longest = Math.max(longest, lunghezzaLineaPx(x1, y1, x2, y2));
  }
  for (const l of linee) addSeg(l.x1, l.y1, l.x2, l.y2);
  for (const s of extraSegmenti) addSeg(s.x1, s.y1, s.x2, s.y2);
  for (const p of extraPunti) addPunto(p.x, p.y);
  if (!has) {
    addPunto(0, 0);
    const seed = Math.max(latoMinimoPx, minLato);
    addPunto(seed, seed);
    longest = Math.max(longest, seed);
  } else if (latoMinimoPx > 0) {
    longest = Math.max(longest, latoMinimoPx);
  }
  const contentW = Math.max(0, maxX - minX);
  const contentH = Math.max(0, maxY - minY);
  const contentSide = Math.max(contentW, contentH, longest, minLato);
  const margine = Math.max(contentSide * MAPPA_FOGLIO_MARGINE_PCT, g);
  const lato = contentSide + margine * 2;
  return {
    x: minX - margine - (contentSide - contentW) / 2,
    y: minY - margine - (contentSide - contentH) / 2,
    width: lato,
    height: lato,
  };
}

export function puntoLungoSegmento(
  x1: number,
  y1: number,
  x2: number,
  y2: number,
  t: number
): MappaPunto {
  return { x: x1 + (x2 - x1) * t, y: y1 + (y2 - y1) * t };
}

export function puntiRiferimentoLinea(l: {
  x1: number;
  y1: number;
  x2: number;
  y2: number;
}): { t: number; punto: MappaPunto }[] {
  return [0.25, 0.5, 0.75].map((t) => ({
    t,
    punto: puntoLungoSegmento(l.x1, l.y1, l.x2, l.y2, t),
  }));
}

export function proiezioneSuSegmento(
  p: MappaPunto,
  x1: number,
  y1: number,
  x2: number,
  y2: number
): { t: number; punto: MappaPunto; dist: number } {
  const dx = x2 - x1;
  const dy = y2 - y1;
  const len2 = dx * dx + dy * dy;
  if (len2 === 0) {
    return {
      t: 0,
      punto: { x: x1, y: y1 },
      dist: Math.hypot(p.x - x1, p.y - y1),
    };
  }
  const t = Math.max(0, Math.min(1, ((p.x - x1) * dx + (p.y - y1) * dy) / len2));
  const punto = puntoLungoSegmento(x1, y1, x2, y2, t);
  return {
    t,
    punto,
    dist: Math.hypot(p.x - punto.x, p.y - punto.y),
  };
}

export type AccavallamentoLinea = {
  lineaId: string;
  hit: MappaPunto;
  qA: number;
  qB: number;
};

export function accavallamentoPuntoSuLinee(
  p: MappaPunto,
  linee: { id: string; x1: number; y1: number; x2: number; y2: number; spessore: number }[],
  griglia: number,
  tolleranza: number,
  excludeId?: string | null
): AccavallamentoLinea | null {
  let best: AccavallamentoLinea | null = null;
  let bestDist = tolleranza;
  for (const l of linee) {
    if (excludeId && l.id === excludeId) continue;
    const pr = proiezioneSuSegmento(p, l.x1, l.y1, l.x2, l.y2);
    const extra = (l.spessore || 0) / 2;
    if (pr.dist <= bestDist + extra) {
      bestDist = pr.dist;
      best = {
        lineaId: l.id,
        hit: pr.punto,
        qA: quadratiTraPunti(l.x1, l.y1, pr.punto.x, pr.punto.y, griglia),
        qB: quadratiTraPunti(pr.punto.x, pr.punto.y, l.x2, l.y2, griglia),
      };
    }
  }
  return best;
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
