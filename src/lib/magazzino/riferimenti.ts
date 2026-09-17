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
