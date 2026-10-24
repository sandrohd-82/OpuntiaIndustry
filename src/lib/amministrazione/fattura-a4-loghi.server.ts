import { readFile } from "node:fs/promises";
import path from "node:path";
import { getPublicAppUrl } from "@/lib/auth/app-url";
import type { FatturaA4Logo } from "@/lib/amministrazione/fattura-a4-pdf";

function pngSize(buf: Buffer): { w: number; h: number } {
  if (buf.length < 24 || buf.toString("ascii", 1, 4) !== "PNG") {
    return { w: 1, h: 1 };
  }
  return { w: buf.readUInt32BE(16), h: buf.readUInt32BE(20) };
}

async function bytesLogo(file: string): Promise<Buffer | null> {
  try {
    return await readFile(path.join(process.cwd(), "public", file));
  } catch (e) {
    console.error("[fattura a4 logo file]", file, e);
  }
  try {
    const url = `${getPublicAppUrl()}/${file.replace(/^\/+/, "")}`;
    const res = await fetch(url);
    if (!res.ok) return null;
    return Buffer.from(await res.arrayBuffer());
  } catch (e) {
    console.error("[fattura a4 logo url]", file, e);
    return null;
  }
}

async function logoDaFile(
  file: string,
  widthMm: number,
  maxH: number
): Promise<FatturaA4Logo | null> {
  const buf = await bytesLogo(file);
  if (!buf) return null;
  const misura = pngSize(buf);
  const heightMm =
    misura.w > 0 ? Math.min(maxH, (widthMm * misura.h) / misura.w) : maxH;
  return {
    dataUrl: `data:image/png;base64,${buf.toString("base64")}`,
    widthMm,
    heightMm,
  };
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
