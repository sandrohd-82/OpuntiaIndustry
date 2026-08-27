const URL_RE =
  /https?:\/\/[^\s<>"'`)\]]+/gi;

export function extractHttpUrls(text: string): string[] {
  const raw = text.match(URL_RE) ?? [];
  const seen = new Set<string>();
  const out: string[] = [];
  for (const u of raw) {
    const cleaned = u.replace(/[.,;:!?)]+$/g, "");
    if (!cleaned || seen.has(cleaned)) continue;
    try {
      const parsed = new URL(cleaned);
      if (parsed.protocol !== "http:" && parsed.protocol !== "https:") continue;
      seen.add(cleaned);
      out.push(cleaned);
    } catch {
      /* skip */
    }
  }
  return out.slice(0, 5);
}

export function isLikelyImageFile(
  fileType?: string | null,
  fileName?: string | null,
  fileUrl?: string | null
): boolean {
  const ft = (fileType ?? "").toLowerCase();
  if (ft.startsWith("image/")) return true;
  const name = (fileName ?? fileUrl ?? "").toLowerCase();
  return /\.(jpe?g|png|gif|webp|bmp|svg)(\?|$)/i.test(name);
}

export function isLikelyPdfFile(
  fileType?: string | null,
  fileName?: string | null,
  fileUrl?: string | null
): boolean {
  const ft = (fileType ?? "").toLowerCase();
  if (ft === "application/pdf" || ft.includes("pdf")) return true;
  const name = (fileName ?? fileUrl ?? "").toLowerCase();
  return /\.pdf(\?|$)/i.test(name);
}

export function isLikelyVideoFile(
  fileType?: string | null,
  fileName?: string | null
): boolean {
  const ft = (fileType ?? "").toLowerCase();
  if (ft.startsWith("video/")) return true;
  const name = (fileName ?? "").toLowerCase();
  return /\.(mp4|webm|mov|avi|mkv)(\?|$)/i.test(name);
}
