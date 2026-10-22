import { readFile } from "node:fs/promises";
import path from "node:path";
import type { FatturaA4Logo } from "@/lib/amministrazione/fattura-a4-pdf";

function pngSize(buf: Buffer): { w: number; h: number } {
  if (buf.length < 24 || buf.toString("ascii", 1, 4) !== "PNG") {
    return { w: 1, h: 1 };
  }
  return { w: buf.readUInt32BE(16), h: buf.readUInt32BE(20) };
}

async function logoDaFile(
  file: string,
  widthMm: number,
  maxH: number
): Promise<FatturaA4Logo | null> {
  try {
    const buf = await readFile(path.join(process.cwd(), "public", file));
    const misura = pngSize(buf);
    const heightMm =
      misura.w > 0 ? Math.min(maxH, (widthMm * misura.h) / misura.w) : maxH;
    return {
      dataUrl: `data:image/png;base64,${buf.toString("base64")}`,
      widthMm,
      heightMm,
    };
  } catch (e) {
    console.error("[fattura a4 logo]", file, e);
    return null;
  }
}

/** Loghi della bozza, letti da public/ sul server che allega il PDF. */
export async function caricaLoghiFatturaA4Server(): Promise<{
  agrinsicilia: FatturaA4Logo | null;
  opuntia: FatturaA4Logo | null;
}> {
  const [agrinsicilia, opuntia] = await Promise.all([
    logoDaFile("Agrinsicilia-Coop.png", 78, 28),
    logoDaFile("OpuntiaItalia.png", 22, 12),
  ]);
  return { agrinsicilia, opuntia };
}
