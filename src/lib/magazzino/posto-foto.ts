import { z } from "zod";

export const POSTO_FOTO_BUCKET = "posto-foto";
export const POSTO_FOTO_MAX_BYTES = 20 * 1024 * 1024;
export const POSTO_FOTO_MAX_PER_POSTO = 20;
export const POSTO_FOTO_SCALE_DEFAULT = 2;

export const POSTO_FOTO_MIME = new Set([
  "image/jpeg",
  "image/jpg",
  "image/pjpeg",
  "image/png",
  "image/x-png",
  "image/webp",
]);

const ESTENSIONI_FOTO = new Set([
  "jpg",
  "jpeg",
  "jfif",
  "pjpeg",
  "png",
  "webp",
  "bmp",
  "gif",
  "heic",
  "heif",
]);

export function estensioneFoto(name: string): string {
  const i = name.lastIndexOf(".");
  return i >= 0 ? name.slice(i + 1).toLowerCase() : "";
}

export function fileSembraFoto(file: { name: string; type: string }): boolean {
  const mime = (file.type || "").toLowerCase().trim();
  if (mime.startsWith("image/")) return true;
  return ESTENSIONI_FOTO.has(estensioneFoto(file.name));
}

export function mimeDaBytes(bytes: Uint8Array, fallback = ""): string {
  if (bytes.length >= 3 && bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff) {
    return "image/jpeg";
  }
  if (
    bytes.length >= 8 &&
    bytes[0] === 0x89 &&
    bytes[1] === 0x50 &&
    bytes[2] === 0x4e &&
    bytes[3] === 0x47
  ) {
    return "image/png";
  }
  if (
    bytes.length >= 12 &&
    bytes[0] === 0x52 &&
    bytes[1] === 0x49 &&
    bytes[2] === 0x46 &&
    bytes[3] === 0x46 &&
    bytes[8] === 0x57 &&
    bytes[9] === 0x45 &&
    bytes[10] === 0x42 &&
    bytes[11] === 0x50
  ) {
    return "image/webp";
  }
  if (
    bytes.length >= 12 &&
    bytes[4] === 0x66 &&
    bytes[5] === 0x74 &&
    bytes[6] === 0x79 &&
    bytes[7] === 0x70
  ) {
    return "image/heic";
  }
  return fallback;
}

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
