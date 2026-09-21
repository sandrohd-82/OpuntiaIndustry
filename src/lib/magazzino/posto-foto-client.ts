import { fileSembraFoto } from "@/lib/magazzino/posto-foto";

const MAX_LATO = 2560;
const MAX_BYTES_OK = 3 * 1024 * 1024;
const TARGET_BYTES = 2.4 * 1024 * 1024;

function estensione(name: string): string {
  const i = name.lastIndexOf(".");
  return i >= 0 ? name.slice(i + 1).toLowerCase() : "";
}

function nomeJpeg(name: string): string {
  const base = name.replace(/\.[^.]+$/, "").trim() || "foto";
  return `${base}.jpg`;
}

async function blobDaCanvas(
  canvas: HTMLCanvasElement,
  quality: number
): Promise<Blob> {
  const blob = await new Promise<Blob | null>((resolve) =>
    canvas.toBlob(resolve, "image/jpeg", quality)
  );
  if (!blob) throw new Error("Ridimensionamento foto non riuscito.");
  return blob;
}

async function bitmapDaFile(file: File): Promise<ImageBitmap | HTMLImageElement> {
  try {
    return await createImageBitmap(file, { imageOrientation: "from-image" });
  } catch {
    /* continua con Image */
  }
  const url = URL.createObjectURL(file);
  try {
    const img = await new Promise<HTMLImageElement>((resolve, reject) => {
      const el = new Image();
      el.onload = () => resolve(el);
      el.onerror = () =>
        reject(
          new Error(
            "Formato non leggibile. Esporta la foto in JPG o PNG (HEIC non supportato)."
          )
        );
      el.src = url;
    });
    return img;
  } finally {
    URL.revokeObjectURL(url);
  }
}

async function conTimeout<T>(p: Promise<T>, ms: number, msg: string): Promise<T> {
  let t: ReturnType<typeof setTimeout> | undefined;
  try {
    return await Promise.race([
      p,
      new Promise<T>((_, reject) => {
        t = setTimeout(() => reject(new Error(msg)), ms);
      }),
    ]);
  } finally {
    if (t) clearTimeout(t);
  }
}

/**
 * Se la foto è grande la riduce a JPEG; niente limite imposto all’utente.
 */
export async function preparaFotoPostoPerUpload(file: File): Promise<File> {
  if (!fileSembraFoto(file)) {
    throw new Error(`«${file.name}» non è un’immagine.`);
  }
  const ext = estensione(file.name);
  if (ext === "heic" || ext === "heif" || file.type === "image/heic") {
    throw new Error(
      "Foto HEIC non supportata. Salvala come JPG o PNG e riprova."
    );
  }
  const mime = (file.type || "").toLowerCase();
  const giaOk =
    file.size <= MAX_BYTES_OK &&
    (mime === "image/jpeg" ||
      mime === "image/jpg" ||
      mime === "image/png" ||
      mime === "image/webp" ||
      ext === "jpg" ||
      ext === "jpeg" ||
      ext === "png" ||
      ext === "webp");

  let bmp: ImageBitmap | HTMLImageElement;
  try {
    bmp = await conTimeout(
      bitmapDaFile(file),
      12_000,
      "Preparazione foto troppo lenta. Riprova con un JPG più piccolo."
    );
  } catch (e) {
    if (giaOk) return file;
    throw e instanceof Error ? e : new Error("Immagine non leggibile.");
  }
  const w = Math.max(1, Number(bmp.width) || 1);
  const h = Math.max(1, Number(bmp.height) || 1);
  if (giaOk && w <= MAX_LATO && h <= MAX_LATO) {
    if ("close" in bmp && typeof bmp.close === "function") bmp.close();
    return file;
  }
  const scale = Math.min(1, MAX_LATO / Math.max(w, h, 1));
  const cw = Math.max(1, Math.round(w * scale));
  const ch = Math.max(1, Math.round(h * scale));
  const canvas = document.createElement("canvas");
  canvas.width = cw;
  canvas.height = ch;
  const ctx = canvas.getContext("2d");
  if (!ctx) {
    if ("close" in bmp && typeof bmp.close === "function") bmp.close();
    throw new Error("Ridimensionamento foto non riuscito.");
  }
  ctx.drawImage(bmp, 0, 0, cw, ch);
  if ("close" in bmp && typeof bmp.close === "function") bmp.close();

  let quality = 0.86;
  let blob = await blobDaCanvas(canvas, quality);
  while (blob.size > TARGET_BYTES && quality > 0.55) {
    quality -= 0.1;
    blob = await blobDaCanvas(canvas, quality);
  }
  return new File([blob], nomeJpeg(file.name), { type: "image/jpeg" });
}
