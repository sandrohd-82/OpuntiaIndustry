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

const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export function isUbicazioneUuid(value: string): boolean {
  return UUID_RE.test(value.trim());
}

function erroreFotoLeggibile(raw: string): string {
  if (/Server Components|digest|omitted in production/i.test(raw)) {
    return "Elenco foto non disponibile. Riprova.";
  }
  return raw || "Elenco foto non disponibile.";
}

export async function fetchFotoPosto(
  ubicazioneId: string
): Promise<
  { success: true; foto: PostoFoto[] } | { success: false; error: string }
> {
  try {
    const q = new URLSearchParams({ ubicazioneId });
    const res = await fetch(`/api/magazzino/posto-foto?${q}`, {
      credentials: "include",
      cache: "no-store",
    });
    const data = (await res.json().catch(() => null)) as
      | { success: true; foto: PostoFoto[] }
      | { success: false; error?: string }
      | null;
    if (!data || !("success" in data) || !data.success) {
      return {
        success: false,
        error: erroreFotoLeggibile(
          data && "error" in data && data.error ? data.error : ""
        ),
      };
    }
    return data;
  } catch {
    return { success: false, error: "Elenco foto non disponibile." };
  }
}

export async function fetchFotoPrincipaliPosti(
  ubicazioneIds: string[]
): Promise<
  | { success: true; perPosto: Record<string, PostoFotoPrincipale> }
  | { success: false; error: string }
> {
  try {
    const ids = [...new Set(ubicazioneIds.filter(Boolean))];
    if (!ids.length) return { success: true, perPosto: {} };
    const q = new URLSearchParams({ ids: ids.join(",") });
    const res = await fetch(`/api/magazzino/posto-foto?${q}`, {
      credentials: "include",
      cache: "no-store",
    });
    const data = (await res.json().catch(() => null)) as
      | { success: true; perPosto: Record<string, PostoFotoPrincipale> }
      | { success: false; error?: string }
      | null;
    if (!data || !("success" in data) || !data.success) {
      return {
        success: false,
        error: erroreFotoLeggibile(
          data && "error" in data && data.error ? data.error : ""
        ),
      };
    }
    return data;
  } catch {
    return { success: false, error: "Elenco foto non disponibile." };
  }
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
