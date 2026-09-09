/** Contrasto WCAG tra inchiostro e sfondo (hex #RRGGBB). */

function parseHexRgb(hex: string): [number, number, number] | null {
  const raw = hex.replace("#", "").trim();
  if (!/^[0-9a-fA-F]{6}$/.test(raw)) return null;
  return [
    parseInt(raw.slice(0, 2), 16),
    parseInt(raw.slice(2, 4), 16),
    parseInt(raw.slice(4, 6), 16),
  ];
}

function channelLin(c: number): number {
  const n = c / 255;
  return n <= 0.03928 ? n / 12.92 : ((n + 0.055) / 1.055) ** 2.4;
}

export function relativeLuminance(hex: string): number {
  const rgb = parseHexRgb(hex);
  if (!rgb) return 0.2;
  const [r, g, b] = rgb;
  return 0.2126 * channelLin(r) + 0.7152 * channelLin(g) + 0.0722 * channelLin(b);
}

export function contrastRatio(hexA: string, hexB: string): number {
  const a = relativeLuminance(hexA);
  const b = relativeLuminance(hexB);
  const hi = Math.max(a, b);
  const lo = Math.min(a, b);
  return (hi + 0.05) / (lo + 0.05);
}

/**
 * Preferisce il bianco sul cerchio colorato; se il contrasto non è alto, usa il nero.
 */
export function contrastingInkOn(backgroundHex: string): "#ffffff" | "#0f172a" {
  const white = contrastRatio(backgroundHex, "#ffffff");
  if (white >= 3) return "#ffffff";
  return "#0f172a";
}

export function contrastingInkOnWhite(colorHex: string): string {
  return contrastRatio(colorHex, "#ffffff") >= 3 ? colorHex : "#0f172a";
}
