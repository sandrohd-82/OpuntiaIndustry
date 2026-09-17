import { z } from "zod";
import type { MappaLinea, MappaPunto } from "@/lib/magazzino/mappa";
import type { MappaAreaDisegnata } from "@/lib/magazzino/ubicazioni";

export const MAPPA_ASSI_ORIGINE = ["x", "y"] as const;
export type MappaAsseOrigine = (typeof MAPPA_ASSI_ORIGINE)[number];

export type MappaRettangolo = {
  x: number;
  y: number;
  width: number;
  height: number;
};

export type MappaRiferimentoPunto = {
  id: string;
  etichetta: string;
  offsetQuadrati: number;
};

export type MappaRiferimentoGruppo = {
  id: string;
  asseId: string;
  mappaOrigineId: string;
  mappaOrigineEtichetta: string;
  asseOrigine: MappaAsseOrigine;
  limiteWidthQ: number;
  limiteHeightQ: number;
  destX: number;
  destY: number;
  destWidth: number;
  destHeight: number;
  origineX: number;
  origineY: number;
  origineW: number;
  origineH: number;
  punti: MappaRiferimentoPunto[];
};

export const mappaRiferimentoPuntoInputSchema = z.object({
  id: z.string().uuid().optional(),
  etichetta: z.string().trim().min(1).max(80),
  offsetQuadrati: z.number().finite().min(0),
});

export const mappaRiferimentoGruppoInputSchema = z.object({
  id: z.string().uuid().optional(),
  asseId: z.string().uuid().optional(),
  mappaOrigineId: z.string().uuid(),
  asseOrigine: z.enum(MAPPA_ASSI_ORIGINE),
  limiteWidthQ: z.number().positive(),
  limiteHeightQ: z.number().positive(),
  destX: z.number().finite(),
  destY: z.number().finite(),
  destWidth: z.number().positive(),
  destHeight: z.number().positive(),
  origineX: z.number().finite(),
  origineY: z.number().finite(),
  origineW: z.number().positive(),
  origineH: z.number().positive(),
  punti: z.array(mappaRiferimentoPuntoInputSchema).max(200),
});

export const importaRiferimentiSchema = z.object({
  mappaId: z.string().uuid(),
  mappaOrigineId: z.string().uuid(),
  asseOrigine: z.enum(MAPPA_ASSI_ORIGINE),
  origineX: z.number().finite(),
  origineY: z.number().finite(),
  origineW: z.number().positive(),
  origineH: z.number().positive(),
  limiteWidthQ: z.number().positive(),
  limiteHeightQ: z.number().positive(),
  destX: z.number().finite(),
  destY: z.number().finite(),
  destWidth: z.number().positive(),
  destHeight: z.number().positive(),
  punti: z
    .array(
      z.object({
        etichetta: z.string().trim().min(1).max(80),
        offsetQuadrati: z.number().finite().min(0),
      })
    )
    .max(200),
});

export type ImportaRiferimentiInput = z.infer<typeof importaRiferimentiSchema>;
export type MappaRiferimentoGruppoInput = z.infer<
  typeof mappaRiferimentoGruppoInputSchema
>;

export function rettangoloLimiteDisegno(
  linee: Pick<MappaLinea, "x1" | "y1" | "x2" | "y2">[],
  aree: Pick<MappaAreaDisegnata, "x" | "y" | "width" | "height">[],
  griglia: number
): MappaRettangolo | null {
  const g = griglia > 0 ? griglia : 20;
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
  if (!has) return null;
  const width = Math.max(g, maxX - minX);
  const height = Math.max(g, maxY - minY);
  return { x: minX, y: minY, width, height };
}

export function misuraAsseQuadrati(
  rect: MappaRettangolo,
  asse: MappaAsseOrigine,
  griglia: number
): number {
  const g = griglia > 0 ? griglia : 20;
  const px = asse === "x" ? rect.width : rect.height;
  return Math.max(1, Math.round(px / g));
}

export function offsetSuLimite(
  p: MappaPunto,
  rect: MappaRettangolo,
  asse: MappaAsseOrigine,
  griglia: number
): number {
  const g = griglia > 0 ? griglia : 20;
  const maxQ = misuraAsseQuadrati(rect, asse, g);
  const raw = asse === "x" ? (p.x - rect.x) / g : (p.y - rect.y) / g;
  return Math.max(0, Math.min(maxQ, Math.round(raw * 10) / 10));
}

export function xGuidaDest(
  gruppo: Pick<MappaRiferimentoGruppo, "destX" | "destWidth">,
  offsetQuadrati: number,
  griglia: number
): number {
  const g = griglia > 0 ? griglia : 20;
  const maxX = gruppo.destX + gruppo.destWidth;
  return Math.min(maxX, Math.max(gruppo.destX, gruppo.destX + offsetQuadrati * g));
}

export function etichettaAsseOrigine(asse: MappaAsseOrigine): string {
  return asse === "x" ? "Larghezza (orizzontale)" : "Profondità (verticale)";
}

export type AngoloImporto = {
  n: 1 | 2 | 3 | 4;
  destX: number;
  destY: number;
  origineQ: { x: number; y: number };
  destQ: { x: number; y: number };
  testo: string;
};

export type LatoImporto = {
  da: 1 | 2 | 3 | 4;
  a: 1 | 2 | 3 | 4;
  origineQ: number;
  destQ: number;
  testo: string;
};

function fmtQ(n: number): string {
  const r = Math.round(n * 10) / 10;
  if (!Number.isFinite(r)) return "0";
  return Math.abs(r - Math.round(r)) < 0.05 ? String(Math.round(r)) : String(r);
}

export function clipEtichettaImporto(value: string, max = 80): string {
  const t = value.trim().replace(/\s+/g, " ");
  if (t.length <= max) return t;
  return `${t.slice(0, Math.max(1, max - 1))}…`;
}

export function grigliaOrigineImporto(
  g: Pick<
    MappaRiferimentoGruppo,
    "asseOrigine" | "origineW" | "origineH" | "limiteWidthQ"
  >
): number {
  const px = g.asseOrigine === "x" ? g.origineW : g.origineH;
  if (g.limiteWidthQ > 0 && px > 0) return px / g.limiteWidthQ;
  return 20;
}

export function grigliaDestImporto(
  g: Pick<MappaRiferimentoGruppo, "destWidth" | "limiteWidthQ">
): number {
  if (g.limiteWidthQ > 0 && g.destWidth > 0) return g.destWidth / g.limiteWidthQ;
  return 20;
}

export function dettaglioAngoliImporto(
  g: Pick<
    MappaRiferimentoGruppo,
    | "asseOrigine"
    | "origineW"
    | "origineH"
    | "limiteWidthQ"
    | "limiteHeightQ"
    | "destX"
    | "destY"
    | "destWidth"
    | "destHeight"
  >
): AngoloImporto[] {
  const srcG = grigliaOrigineImporto(g);
  const destG = grigliaDestImporto(g);
  const owQ = srcG > 0 ? g.origineW / srcG : 0;
  const ohQ = srcG > 0 ? g.origineH / srcG : 0;
  const dwQ = destG > 0 ? g.destWidth / destG : 0;
  const dhQ = destG > 0 ? g.destHeight / destG : 0;
  const corners: AngoloImporto[] = [
    {
      n: 1,
      destX: g.destX,
      destY: g.destY,
      origineQ: { x: 0, y: 0 },
      destQ: { x: 0, y: 0 },
      testo: "",
    },
    {
      n: 2,
      destX: g.destX + g.destWidth,
      destY: g.destY,
      origineQ: { x: owQ, y: 0 },
      destQ: { x: dwQ, y: 0 },
      testo: "",
    },
    {
      n: 3,
      destX: g.destX,
      destY: g.destY + g.destHeight,
      origineQ: { x: 0, y: ohQ },
      destQ: { x: 0, y: dhQ },
      testo: "",
    },
    {
      n: 4,
      destX: g.destX + g.destWidth,
      destY: g.destY + g.destHeight,
      origineQ: { x: owQ, y: ohQ },
      destQ: { x: dwQ, y: dhQ },
      testo: "",
    },
  ];
  return corners.map((c) => ({
    ...c,
    testo: `Angolo ${c.n} da ${fmtQ(c.origineQ.x)},${fmtQ(c.origineQ.y)} a ${fmtQ(c.destQ.x)},${fmtQ(c.destQ.y)}`,
  }));
}

export function dettaglioLatiImporto(
  g: Parameters<typeof dettaglioAngoliImporto>[0]
): LatoImporto[] {
  const a = dettaglioAngoliImporto(g);
  const coppie: [1 | 2 | 3 | 4, 1 | 2 | 3 | 4][] = [
    [1, 2],
    [2, 4],
    [4, 3],
    [3, 1],
  ];
  return coppie.map(([da, aN]) => {
    const p = a[da - 1]!;
    const q = a[aN - 1]!;
    const origineQ = Math.hypot(q.origineQ.x - p.origineQ.x, q.origineQ.y - p.origineQ.y);
    const destQ = Math.hypot(q.destQ.x - p.destQ.x, q.destQ.y - p.destQ.y);
    return {
      da,
      a: aN,
      origineQ,
      destQ,
      testo: `Lato ${da}–${aN} da ${fmtQ(origineQ)} q a ${fmtQ(destQ)} q`,
    };
  });
}

export function etichettaAsseImporto(
  g: Parameters<typeof dettaglioAngoliImporto>[0]
): string {
  const angoli = dettaglioAngoliImporto(g);
  return clipEtichettaImporto(
    `Quadrato limite · ${angoli.map((c) => c.testo).join(" · ")}`,
    240
  );
}

export function etichettaPuntoDaCoordinate(
  nome: string,
  p: MappaPunto,
  limite: MappaRettangolo,
  griglia: number
): string {
  const g = griglia > 0 ? griglia : 20;
  const xq = (p.x - limite.x) / g;
  const yq = (p.y - limite.y) / g;
  return clipEtichettaImporto(`${nome} da ${fmtQ(xq)},${fmtQ(yq)}`);
}

export function puntiDaGeometriaOrigine(
  linee: Pick<MappaLinea, "x1" | "y1" | "x2" | "y2">[],
  aree: Pick<MappaAreaDisegnata, "x" | "y" | "width" | "height">[],
  limite: MappaRettangolo,
  asse: MappaAsseOrigine,
  griglia: number
): { etichetta: string; offsetQuadrati: number }[] {
  const g = griglia > 0 ? griglia : 20;
  const pad = g * 0.6;
  function dentro(x: number, y: number): boolean {
    return (
      x >= limite.x - pad &&
      x <= limite.x + limite.width + pad &&
      y >= limite.y - pad &&
      y <= limite.y + limite.height + pad
    );
  }
  const grezzi: { x: number; y: number; etichetta: string }[] = [];
  limiteAngoli(limite).forEach((c, i) => {
    grezzi.push({
      x: c.x,
      y: c.y,
      etichetta: etichettaPuntoDaCoordinate(`Angolo ${i + 1}`, c, limite, g),
    });
  });
  linee.forEach((l, i) => {
    const n = i + 1;
    const estremi = [
      { x: l.x1, y: l.y1, ruolo: "inizio" },
      { x: l.x2, y: l.y2, ruolo: "fine" },
    ];
    for (const e of estremi) {
      if (!dentro(e.x, e.y)) continue;
      grezzi.push({
        x: e.x,
        y: e.y,
        etichetta: etichettaPuntoDaCoordinate(`L${n} ${e.ruolo}`, e, limite, g),
      });
    }
  });
  aree.forEach((a, i) => {
    const n = i + 1;
    limiteAngoli({ x: a.x, y: a.y, width: a.width, height: a.height }).forEach(
      (c, k) => {
        if (!dentro(c.x, c.y)) return;
        grezzi.push({
          x: c.x,
          y: c.y,
          etichetta: etichettaPuntoDaCoordinate(`Area ${n} angolo ${k + 1}`, c, limite, g),
        });
      }
    );
  });
  const byOff = new Map<string, { etichetta: string; offsetQuadrati: number }>();
  for (const p of grezzi) {
    const offset = offsetSuLimite(p, limite, asse, g);
    const key = String(offset);
    if (!byOff.has(key)) {
      byOff.set(key, { etichetta: p.etichetta, offsetQuadrati: offset });
    }
  }
  return [...byOff.values()].sort((a, b) => a.offsetQuadrati - b.offsetQuadrati);
}

export function unisciPuntiImporto(
  automatici: { etichetta: string; offsetQuadrati: number }[],
  manuali: { etichetta: string; offsetQuadrati: number }[]
): { etichetta: string; offsetQuadrati: number }[] {
  const map = new Map<string, { etichetta: string; offsetQuadrati: number }>();
  for (const p of automatici) {
    map.set(String(p.offsetQuadrati), {
      etichetta: clipEtichettaImporto(p.etichetta),
      offsetQuadrati: p.offsetQuadrati,
    });
  }
  for (const p of manuali) {
    map.set(String(p.offsetQuadrati), {
      etichetta: clipEtichettaImporto(p.etichetta),
      offsetQuadrati: p.offsetQuadrati,
    });
  }
  return [...map.values()].sort((a, b) => a.offsetQuadrati - b.offsetQuadrati);
}

function limiteAngoli(rect: MappaRettangolo): MappaPunto[] {
  return [
    { x: rect.x, y: rect.y },
    { x: rect.x + rect.width, y: rect.y },
    { x: rect.x, y: rect.y + rect.height },
    { x: rect.x + rect.width, y: rect.y + rect.height },
  ];
}
