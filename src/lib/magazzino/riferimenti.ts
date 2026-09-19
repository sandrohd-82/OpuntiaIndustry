import { z } from "zod";
import type {
  MappaImportRotazione,
  MappaLinea,
  MappaPunto,
} from "@/lib/magazzino/mappa";
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

export const MAPPA_IMPORT_MODALITA = ["riferimento", "oggetto"] as const;
export type MappaImportModalita = (typeof MAPPA_IMPORT_MODALITA)[number];

export const MAPPA_CALCO_TIPI = ["punto", "linea", "rettangolo"] as const;
export type MappaCalcoTipo = (typeof MAPPA_CALCO_TIPI)[number];

export type MappaCalcoElemento = {
  id?: string;
  tipo: MappaCalcoTipo;
  etichetta: string;
  /** Coordinate normalizzate 0–1 rispetto al rettangolo dest. */
  x: number;
  y: number;
  x2?: number;
  y2?: number;
  width?: number;
  height?: number;
};

export type MappaCalcoGeometria = {
  haLimite: boolean;
  elementi: MappaCalcoElemento[];
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
  haLimite: boolean;
  calchi: MappaCalcoElemento[];
};

export const mappaRiferimentoPuntoInputSchema = z.object({
  id: z.string().uuid().optional(),
  etichetta: z.string().trim().min(1).max(80),
  offsetQuadrati: z.number().finite().min(0),
});

export const mappaCalcoElementoSchema = z.object({
  id: z.string().trim().min(1).max(80).optional(),
  tipo: z.enum(MAPPA_CALCO_TIPI),
  etichetta: z.string().trim().min(1).max(80),
  x: z.number().finite(),
  y: z.number().finite(),
  x2: z.number().finite().optional(),
  y2: z.number().finite().optional(),
  width: z.number().finite().optional(),
  height: z.number().finite().optional(),
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
  haLimite: z.boolean().optional(),
  calchi: z.array(mappaCalcoElementoSchema).max(500).optional(),
});

export const importaElementoOrigineSchema = z.discriminatedUnion("tipo", [
  z.object({
    tipo: z.literal("punto"),
    etichetta: z.string().trim().min(1).max(80),
    x: z.number().finite(),
    y: z.number().finite(),
  }),
  z.object({
    tipo: z.literal("linea"),
    origineId: z.string().uuid(),
  }),
  z.object({
    tipo: z.literal("rettangolo"),
    origineId: z.string().uuid(),
  }),
]);

export const importaRiferimentiSchema = z
  .object({
    mappaId: z.string().uuid(),
    mappaOrigineId: z.string().uuid(),
    modalita: z.enum(MAPPA_IMPORT_MODALITA),
    usaLimite: z.boolean().optional(),
    asseOrigine: z.enum(MAPPA_ASSI_ORIGINE).optional(),
    origineX: z.number().finite().optional(),
    origineY: z.number().finite().optional(),
    origineW: z.number().positive().optional(),
    origineH: z.number().positive().optional(),
    limiteWidthQ: z.number().positive().optional(),
    limiteHeightQ: z.number().positive().optional(),
    destX: z.number().finite().optional(),
    destY: z.number().finite().optional(),
    destWidth: z.number().positive().optional(),
    destHeight: z.number().positive().optional(),
    rotazione: z.union([z.literal(0), z.literal(90), z.literal(180), z.literal(270)]).optional(),
    elementi: z.array(importaElementoOrigineSchema).max(500).optional(),
    punti: z
      .array(
        z.object({
          etichetta: z.string().trim().min(1).max(80),
          offsetQuadrati: z.number().finite().min(0),
        })
      )
      .max(200)
      .optional(),
  })
  .superRefine((v, ctx) => {
    const n = v.elementi?.length ?? 0;
    if (n < 1 && !v.usaLimite) {
      ctx.addIssue({
        code: "custom",
        message: "Seleziona almeno un punto, una linea o un quadrato da importare.",
      });
    }
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

export function yGuidaDest(
  gruppo: Pick<MappaRiferimentoGruppo, "destY" | "destHeight">,
  offsetQuadrati: number,
  griglia: number
): number {
  const g = griglia > 0 ? griglia : 20;
  const maxY = gruppo.destY + gruppo.destHeight;
  return Math.min(maxY, Math.max(gruppo.destY, gruppo.destY + offsetQuadrati * g));
}

/** Stessa linea della preview: verticale se asse X, orizzontale se asse Y. */
export function segmentoGuidaDest(
  gruppo: Pick<
    MappaRiferimentoGruppo,
    "asseOrigine" | "destX" | "destY" | "destWidth" | "destHeight"
  >,
  offsetQuadrati: number,
  griglia: number
): { x1: number; y1: number; x2: number; y2: number } {
  if (gruppo.asseOrigine === "y") {
    const y = yGuidaDest(gruppo, offsetQuadrati, griglia);
    return {
      x1: gruppo.destX,
      y1: y,
      x2: gruppo.destX + gruppo.destWidth,
      y2: y,
    };
  }
  const x = xGuidaDest(gruppo, offsetQuadrati, griglia);
  return {
    x1: x,
    y1: gruppo.destY,
    x2: x,
    y2: gruppo.destY + gruppo.destHeight,
  };
}

export function misureRettangoloDestImporto(
  asse: MappaAsseOrigine,
  copiatoQ: number,
  secondoQ: number,
  griglia: number
): { destWidth: number; destHeight: number } {
  const g = griglia > 0 ? griglia : 20;
  const copiato = Math.max(1, copiatoQ) * g;
  const secondo = Math.max(1, secondoQ) * g;
  if (asse === "y") {
    return { destWidth: secondo, destHeight: copiato };
  }
  return { destWidth: copiato, destHeight: secondo };
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
  g: Pick<
    MappaRiferimentoGruppo,
    "asseOrigine" | "destWidth" | "destHeight" | "limiteWidthQ"
  >
): number {
  const px = g.asseOrigine === "y" ? g.destHeight : g.destWidth;
  if (g.limiteWidthQ > 0 && px > 0) return px / g.limiteWidthQ;
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
  g: Parameters<typeof dettaglioAngoliImporto>[0] & {
    haLimite?: boolean;
    calchi?: MappaCalcoElemento[];
  }
): string {
  const calchi = g.calchi ?? [];
  if (calchi.length && g.haLimite === false) {
    const nP = calchi.filter((c) => c.tipo === "punto").length;
    const nL = calchi.filter((c) => c.tipo === "linea").length;
    const nR = calchi.filter((c) => c.tipo === "rettangolo").length;
    const parti = [
      nP ? `${nP} punt${nP === 1 ? "o" : "i"}` : "",
      nL ? `${nL} line${nL === 1 ? "a" : "e"}` : "",
      nR ? `${nR} quadrat${nR === 1 ? "o" : "i"}` : "",
    ].filter(Boolean);
    return clipEtichettaImporto(`Calco · ${parti.join(" · ") || "riferimento"}`, 240);
  }
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

export type ImportaEsito = {
  modalita: MappaImportModalita;
  linee: number;
  aree: number;
  calchi: number;
};

export type ImportaElementoRisolto =
  | {
      tipo: "punto";
      etichetta: string;
      x: number;
      y: number;
    }
  | {
      tipo: "linea";
      etichetta: string;
      x1: number;
      y1: number;
      x2: number;
      y2: number;
      spessore: number;
      colore: string;
    }
  | {
      tipo: "rettangolo";
      etichetta: string;
      x: number;
      y: number;
      width: number;
      height: number;
      codice: string;
      nome: string;
      parentId: string | null;
      ubicazioneId: string;
    };

export function ruotaElementiImporto(
  elementi: ImportaElementoRisolto[],
  foglio: { x: number; y: number; width: number; height: number },
  gradi: MappaImportRotazione
): ImportaElementoRisolto[] {
  if (gradi === 0) return elementi;
  const ruota = (p: MappaPunto): MappaPunto => {
    const cx = foglio.x + foglio.width / 2;
    const cy = foglio.y + foglio.height / 2;
    const dx = p.x - cx;
    const dy = p.y - cy;
    if (gradi === 90) return { x: cx + dy, y: cy - dx };
    if (gradi === 180) return { x: cx - dx, y: cy - dy };
    return { x: cx - dy, y: cy + dx };
  };
  return elementi.map((e) => {
    if (e.tipo === "punto") {
      const p = ruota(e);
      return { ...e, x: p.x, y: p.y };
    }
    if (e.tipo === "linea") {
      const a = ruota({ x: e.x1, y: e.y1 });
      const b = ruota({ x: e.x2, y: e.y2 });
      return { ...e, x1: a.x, y1: a.y, x2: b.x, y2: b.y };
    }
    const pts = [
      ruota({ x: e.x, y: e.y }),
      ruota({ x: e.x + e.width, y: e.y }),
      ruota({ x: e.x + e.width, y: e.y + e.height }),
      ruota({ x: e.x, y: e.y + e.height }),
    ];
    const xs = pts.map((p) => p.x);
    const ys = pts.map((p) => p.y);
    const x = Math.min(...xs);
    const y = Math.min(...ys);
    return {
      ...e,
      x,
      y,
      width: Math.max(1, Math.max(...xs) - x),
      height: Math.max(1, Math.max(...ys) - y),
    };
  });
}

export function parseCalcoGeometria(raw: unknown): MappaCalcoGeometria {
  if (raw == null) return { haLimite: true, elementi: [] };
  if (Array.isArray(raw)) {
    return {
      haLimite: true,
      elementi: raw
        .map((item, i) => normalizzaCalcoBruto(item, i))
        .filter((x): x is MappaCalcoElemento => Boolean(x)),
    };
  }
  if (typeof raw === "object") {
    const o = raw as { haLimite?: boolean; elementi?: unknown };
    const list = Array.isArray(o.elementi) ? o.elementi : [];
    return {
      haLimite: o.haLimite !== false,
      elementi: list
        .map((item, i) => normalizzaCalcoBruto(item, i))
        .filter((x): x is MappaCalcoElemento => Boolean(x)),
    };
  }
  return { haLimite: true, elementi: [] };
}

function normalizzaCalcoBruto(
  raw: unknown,
  index: number
): MappaCalcoElemento | null {
  if (!raw || typeof raw !== "object") return null;
  const o = raw as Record<string, unknown>;
  const tipo = o.tipo;
  if (tipo !== "punto" && tipo !== "linea" && tipo !== "rettangolo") return null;
  const x = Number(o.x);
  const y = Number(o.y);
  if (!Number.isFinite(x) || !Number.isFinite(y)) return null;
  const id =
    typeof o.id === "string" && o.id.length > 0
      ? o.id
      : `calco-${tipo}-${index}`;
  const etichetta = clipEtichettaImporto(
    typeof o.etichetta === "string" && o.etichetta.trim()
      ? o.etichetta
      : tipo === "punto"
        ? `Punto ${index + 1}`
        : tipo === "linea"
          ? `Linea ${index + 1}`
          : `Quadrato ${index + 1}`
  );
  return {
    id,
    tipo,
    etichetta,
    x,
    y,
    x2: Number.isFinite(Number(o.x2)) ? Number(o.x2) : undefined,
    y2: Number.isFinite(Number(o.y2)) ? Number(o.y2) : undefined,
    width: Number.isFinite(Number(o.width)) ? Number(o.width) : undefined,
    height: Number.isFinite(Number(o.height)) ? Number(o.height) : undefined,
  };
}

export function serializzaCalcoGeometria(
  haLimite: boolean,
  elementi: MappaCalcoElemento[]
): MappaCalcoGeometria {
  return { haLimite, elementi };
}

export function rettangoloDaPunti(
  pts: MappaPunto[],
  griglia: number
): MappaRettangolo | null {
  const validi = pts.filter((p) => Number.isFinite(p.x) && Number.isFinite(p.y));
  if (!validi.length) return null;
  const g = griglia > 0 ? griglia : 20;
  const minX = Math.min(...validi.map((p) => p.x));
  const minY = Math.min(...validi.map((p) => p.y));
  const maxX = Math.max(...validi.map((p) => p.x));
  const maxY = Math.max(...validi.map((p) => p.y));
  return {
    x: minX,
    y: minY,
    width: Math.max(g, maxX - minX),
    height: Math.max(g, maxY - minY),
  };
}

export function puntiDiElementiRisolti(
  elementi: ImportaElementoRisolto[]
): MappaPunto[] {
  const pts: MappaPunto[] = [];
  for (const e of elementi) {
    if (e.tipo === "punto") pts.push({ x: e.x, y: e.y });
    else if (e.tipo === "linea") {
      pts.push({ x: e.x1, y: e.y1 }, { x: e.x2, y: e.y2 });
    } else {
      pts.push({ x: e.x, y: e.y }, { x: e.x + e.width, y: e.y + e.height });
    }
  }
  return pts;
}

export function normalizzaNelRect(
  p: MappaPunto,
  rect: MappaRettangolo
): MappaPunto {
  const nx = rect.width > 0 ? (p.x - rect.x) / rect.width : 0.5;
  const ny = rect.height > 0 ? (p.y - rect.y) / rect.height : 0.5;
  return {
    x: Math.max(0, Math.min(1, nx)),
    y: Math.max(0, Math.min(1, ny)),
  };
}

export function assolutizzaNelDest(
  g: Pick<MappaRiferimentoGruppo, "destX" | "destY" | "destWidth" | "destHeight">,
  nx: number,
  ny: number
): MappaPunto {
  return {
    x: g.destX + nx * g.destWidth,
    y: g.destY + ny * g.destHeight,
  };
}

export function calchiDaElementi(
  elementi: ImportaElementoRisolto[],
  origine: MappaRettangolo
): MappaCalcoElemento[] {
  return elementi.map((e, i) => {
    if (e.tipo === "punto") {
      const n = normalizzaNelRect(e, origine);
      return {
        id: crypto.randomUUID(),
        tipo: "punto" as const,
        etichetta: clipEtichettaImporto(e.etichetta || `Punto ${i + 1}`),
        x: n.x,
        y: n.y,
      };
    }
    if (e.tipo === "linea") {
      const a = normalizzaNelRect({ x: e.x1, y: e.y1 }, origine);
      const b = normalizzaNelRect({ x: e.x2, y: e.y2 }, origine);
      return {
        id: crypto.randomUUID(),
        tipo: "linea" as const,
        etichetta: clipEtichettaImporto(e.etichetta || `Linea ${i + 1}`),
        x: a.x,
        y: a.y,
        x2: b.x,
        y2: b.y,
      };
    }
    const a = normalizzaNelRect({ x: e.x, y: e.y }, origine);
    const b = normalizzaNelRect(
      { x: e.x + e.width, y: e.y + e.height },
      origine
    );
    return {
      id: crypto.randomUUID(),
      tipo: "rettangolo" as const,
      etichetta: clipEtichettaImporto(e.etichetta || `Quadrato ${i + 1}`),
      x: Math.min(a.x, b.x),
      y: Math.min(a.y, b.y),
      width: Math.abs(b.x - a.x),
      height: Math.abs(b.y - a.y),
    };
  });
}

export function puntoOrigineSuDest(
  p: MappaPunto,
  origine: MappaRettangolo,
  dest: MappaRettangolo
): MappaPunto {
  const n = normalizzaNelRect(p, origine);
  return {
    x: dest.x + n.x * dest.width,
    y: dest.y + n.y * dest.height,
  };
}

export type LineaGuidaImporto = {
  id: string;
  x1: number;
  y1: number;
  x2: number;
  y2: number;
  spessore: number;
};

export function segmentiCalcoDest(
  g: Pick<
    MappaRiferimentoGruppo,
    "destX" | "destY" | "destWidth" | "destHeight" | "calchi"
  > & { id?: string }
): LineaGuidaImporto[] {
  const out: LineaGuidaImporto[] = [];
  const gid = g.id ?? "calco";
  for (const c of g.calchi ?? []) {
    const cid = c.id ?? "el";
    if (c.tipo === "linea" && c.x2 != null && c.y2 != null) {
      const a = assolutizzaNelDest(g, c.x, c.y);
      const b = assolutizzaNelDest(g, c.x2, c.y2);
      out.push({
        id: `${gid}:${cid}`,
        x1: a.x,
        y1: a.y,
        x2: b.x,
        y2: b.y,
        spessore: 2,
      });
    } else if (c.tipo === "rettangolo" && c.width != null && c.height != null) {
      const a = assolutizzaNelDest(g, c.x, c.y);
      const b = assolutizzaNelDest(g, c.x + c.width, c.y + c.height);
      const x1 = Math.min(a.x, b.x);
      const y1 = Math.min(a.y, b.y);
      const x2 = Math.max(a.x, b.x);
      const y2 = Math.max(a.y, b.y);
      const edges: [number, number, number, number][] = [
        [x1, y1, x2, y1],
        [x2, y1, x2, y2],
        [x2, y2, x1, y2],
        [x1, y2, x1, y1],
      ];
      edges.forEach((e, i) => {
        out.push({
          id: `${gid}:${cid}:e${i}`,
          x1: e[0],
          y1: e[1],
          x2: e[2],
          y2: e[3],
          spessore: 2,
        });
      });
    }
  }
  return out;
}

export function specchiaCalcoElemento(
  el: MappaCalcoElemento,
  kind: "x" | "y"
): MappaCalcoElemento {
  const flip = (v: number) => 1 - v;
  if (kind === "x") {
    if (el.tipo === "rettangolo") {
      const w = el.width ?? 0;
      return { ...el, x: flip(el.x + w) };
    }
    return {
      ...el,
      x: flip(el.x),
      x2: el.x2 == null ? el.x2 : flip(el.x2),
    };
  }
  if (el.tipo === "rettangolo") {
    const h = el.height ?? 0;
    return { ...el, y: flip(el.y + h) };
  }
  return {
    ...el,
    y: flip(el.y),
    y2: el.y2 == null ? el.y2 : flip(el.y2),
  };
}

export function puntiCalcoDest(
  g: Pick<
    MappaRiferimentoGruppo,
    "destX" | "destY" | "destWidth" | "destHeight" | "calchi"
  >
): { id: string; etichetta: string; x: number; y: number }[] {
  const out: { id: string; etichetta: string; x: number; y: number }[] = [];
  for (const c of g.calchi ?? []) {
    if (c.tipo === "punto") {
      const p = assolutizzaNelDest(g, c.x, c.y);
      out.push({ id: c.id ?? c.etichetta, etichetta: c.etichetta, x: p.x, y: p.y });
    }
  }
  return out;
}

export function estremiCalcoDest(
  g: Pick<
    MappaRiferimentoGruppo,
    | "destX"
    | "destY"
    | "destWidth"
    | "destHeight"
    | "calchi"
    | "haLimite"
  >
): MappaPunto[] {
  const pts: MappaPunto[] = [];
  if (g.haLimite !== false) {
    pts.push(
      { x: g.destX, y: g.destY },
      { x: g.destX + g.destWidth, y: g.destY + g.destHeight }
    );
  }
  for (const s of segmentiCalcoDest(g)) {
    pts.push({ x: s.x1, y: s.y1 }, { x: s.x2, y: s.y2 });
  }
  for (const p of puntiCalcoDest(g)) {
    pts.push({ x: p.x, y: p.y });
  }
  if (!pts.length) {
    pts.push(
      { x: g.destX, y: g.destY },
      { x: g.destX + g.destWidth, y: g.destY + g.destHeight }
    );
  }
  return pts;
}

export function lineeGuidaDaRiferimenti(
  gruppi: MappaRiferimentoGruppo[],
  griglia: number
): LineaGuidaImporto[] {
  const out: LineaGuidaImporto[] = [];
  for (const g of gruppi) {
    out.push(...segmentiCalcoDest(g));
    if (g.haLimite !== false) {
      const x1 = g.destX;
      const y1 = g.destY;
      const x2 = g.destX + g.destWidth;
      const y2 = g.destY + g.destHeight;
      const box: [number, number, number, number][] = [
        [x1, y1, x2, y1],
        [x2, y1, x2, y2],
        [x2, y2, x1, y2],
        [x1, y2, x1, y1],
      ];
      box.forEach((e, i) => {
        out.push({
          id: `${g.id}:limite:${i}`,
          x1: e[0],
          y1: e[1],
          x2: e[2],
          y2: e[3],
          spessore: 2,
        });
      });
    }
    for (const p of g.punti) {
      const s = segmentoGuidaDest(g, p.offsetQuadrati, griglia);
      out.push({
        id: `${g.id}:guida:${p.id}`,
        x1: s.x1,
        y1: s.y1,
        x2: s.x2,
        y2: s.y2,
        spessore: 2,
      });
    }
  }
  return out;
}

export function snapPuntoSuCalco(
  p: MappaPunto,
  gruppi: MappaRiferimentoGruppo[],
  tolleranza: number
): MappaPunto | null {
  let best: MappaPunto | null = null;
  let bestDist = tolleranza;
  for (const g of gruppi) {
    for (const c of puntiCalcoDest(g)) {
      const d = Math.hypot(p.x - c.x, p.y - c.y);
      if (d <= bestDist) {
        bestDist = d;
        best = { x: c.x, y: c.y };
      }
    }
    for (const s of segmentiCalcoDest(g)) {
      for (const q of [
        { x: s.x1, y: s.y1 },
        { x: s.x2, y: s.y2 },
      ]) {
        const d = Math.hypot(p.x - q.x, p.y - q.y);
        if (d <= bestDist) {
          bestDist = d;
          best = q;
        }
      }
    }
  }
  return best;
}

export function risolviElementiOrigine(
  elementi: Array<
    | { tipo: "punto"; etichetta: string; x: number; y: number }
    | { tipo: "linea"; origineId: string }
    | { tipo: "rettangolo"; origineId: string }
  >,
  linee: Pick<
    MappaLinea,
    "id" | "x1" | "y1" | "x2" | "y2" | "spessore" | "colore"
  >[],
  aree: Pick<
    MappaAreaDisegnata,
    | "id"
    | "x"
    | "y"
    | "width"
    | "height"
    | "codice"
    | "nome"
    | "parentId"
    | "ubicazioneId"
  >[]
): ImportaElementoRisolto[] {
  const out: ImportaElementoRisolto[] = [];
  let nLinea = 0;
  let nArea = 0;
  for (const el of elementi) {
    if (el.tipo === "punto") {
      out.push({
        tipo: "punto",
        etichetta: clipEtichettaImporto(el.etichetta),
        x: el.x,
        y: el.y,
      });
      continue;
    }
    if (el.tipo === "linea") {
      const l = linee.find((x) => x.id === el.origineId);
      if (!l) continue;
      nLinea += 1;
      out.push({
        tipo: "linea",
        etichetta: `Linea ${nLinea}`,
        x1: l.x1,
        y1: l.y1,
        x2: l.x2,
        y2: l.y2,
        spessore: l.spessore,
        colore: l.colore,
      });
      continue;
    }
    const a = aree.find((x) => x.id === el.origineId);
    if (!a) continue;
    nArea += 1;
    out.push({
      tipo: "rettangolo",
      etichetta: a.codice || a.nome || `Quadrato ${nArea}`,
      x: a.x,
      y: a.y,
      width: a.width,
      height: a.height,
      codice: a.codice,
      nome: a.nome,
      parentId: a.parentId,
      ubicazioneId: a.ubicazioneId,
    });
  }
  return out;
}

export function misuraDestDaOrigine(
  origine: MappaRettangolo,
  destGriglia: number,
  srcGriglia: number
): { destWidth: number; destHeight: number; wQ: number; hQ: number } {
  const sg = srcGriglia > 0 ? srcGriglia : 20;
  const dg = destGriglia > 0 ? destGriglia : 20;
  const wQ = Math.max(1, Math.round(origine.width / sg));
  const hQ = Math.max(1, Math.round(origine.height / sg));
  return { destWidth: wQ * dg, destHeight: hQ * dg, wQ, hQ };
}

export function hitGruppoRiferimento(
  wx: number,
  wy: number,
  gruppi: MappaRiferimentoGruppo[],
  tolleranza: number
): string | null {
  for (let i = gruppi.length - 1; i >= 0; i -= 1) {
    const g = gruppi[i]!;
    if (g.haLimite !== false) {
      if (
        wx >= g.destX &&
        wx <= g.destX + g.destWidth &&
        wy >= g.destY &&
        wy <= g.destY + g.destHeight
      ) {
        return g.id;
      }
    }
    for (const p of puntiCalcoDest(g)) {
      if (Math.hypot(wx - p.x, wy - p.y) <= tolleranza * 1.6) return g.id;
    }
    for (const s of segmentiCalcoDest(g)) {
      const dx = s.x2 - s.x1;
      const dy = s.y2 - s.y1;
      const len2 = dx * dx + dy * dy;
      if (len2 === 0) {
        if (Math.hypot(wx - s.x1, wy - s.y1) <= tolleranza) return g.id;
        continue;
      }
      const t = Math.max(
        0,
        Math.min(1, ((wx - s.x1) * dx + (wy - s.y1) * dy) / len2)
      );
      const hx = s.x1 + t * dx;
      const hy = s.y1 + t * dy;
      if (Math.hypot(wx - hx, wy - hy) <= tolleranza) return g.id;
    }
  }
  return null;
}
