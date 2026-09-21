import { z } from "zod";

export const POSTO_FOTO_BUCKET = "posto-foto";
export const POSTO_FOTO_MAX_BYTES = 15 * 1024 * 1024;
export const POSTO_FOTO_MAX_PER_POSTO = 20;
export const POSTO_FOTO_SCALE_DEFAULT = 2;

export const POSTO_FOTO_MIME = new Set([
  "image/jpeg",
  "image/jpg",
  "image/png",
  "image/webp",
]);

export type PostoFoto = {
  id: string;
  ubicazioneId: string;
  storagePath: string;
  fileName: string;
  mime: string;
  isPrincipale: boolean;
  sortOrder: number;
  fitScale: number;
  offsetX: number;
  offsetY: number;
  url: string;
};

export type PostoFotoPrincipale = {
  ubicazioneId: string;
  url: string;
  fitScale: number;
  offsetX: number;
  offsetY: number;
};

export const aggiornaFitFotoSchema = z.object({
  id: z.string().uuid(),
  fitScale: z.number().min(0.5).max(8),
  offsetX: z.number().min(-4).max(4),
  offsetY: z.number().min(-4).max(4),
});

export type AggiornaFitFotoInput = z.infer<typeof aggiornaFitFotoSchema>;

export function isVistaDallAlto(etichetta: string): boolean {
  const n = etichetta
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[''`´’]/g, "")
    .replace(/\s+/g, "");
  return n.includes("dallalto");
}

export function mimeFotoAmmesso(mime: string): boolean {
  return POSTO_FOTO_MIME.has(mime.toLowerCase().trim());
}

export function rettangoloFotoNelBox(opts: {
  x: number;
  y: number;
  width: number;
  height: number;
  fitScale: number;
  offsetX: number;
  offsetY: number;
}): { x: number; y: number; width: number; height: number } {
  const scale = Number.isFinite(opts.fitScale) ? opts.fitScale : 2;
  const w = opts.width * scale;
  const h = opts.height * scale;
  return {
    x: opts.x + (opts.width - w) / 2 + opts.offsetX * opts.width,
    y: opts.y + (opts.height - h) / 2 + opts.offsetY * opts.height,
    width: w,
    height: h,
  };
}
