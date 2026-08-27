"use server";

import { requireAreaAccess } from "@/lib/areas/guard";
import { z } from "zod";

export type ChatLinkPreview = {
  url: string;
  title: string;
  description: string;
  imageUrl: string | null;
  siteName: string;
};

const urlSchema = z.string().url().max(2000);

type CacheEntry = { at: number; data: ChatLinkPreview | null };
const CACHE = new Map<string, CacheEntry>();
const TTL_MS = 30 * 60 * 1000;

function isBlockedHost(hostname: string): boolean {
  const h = hostname.toLowerCase().replace(/\.$/, "");
  if (
    h === "localhost" ||
    h === "metadata.google.internal" ||
    h.endsWith(".local") ||
    h.endsWith(".internal")
  ) {
    return true;
  }
  // IP letterali
  if (/^\d+\.\d+\.\d+\.\d+$/.test(h)) {
    const parts = h.split(".").map(Number);
    const [a, b] = parts;
    if (a === 10 || a === 127 || a === 0) return true;
    if (a === 169 && b === 254) return true;
    if (a === 172 && b >= 16 && b <= 31) return true;
    if (a === 192 && b === 168) return true;
  }
  return false;
}

function metaContent(html: string, keys: string[]): string {
  for (const key of keys) {
    const reProp = new RegExp(
      `<meta[^>]+(?:property|name)=["']${key}["'][^>]+content=["']([^"']+)["']`,
      "i"
    );
    const reProp2 = new RegExp(
      `<meta[^>]+content=["']([^"']+)["'][^>]+(?:property|name)=["']${key}["']`,
      "i"
    );
    const m = html.match(reProp) ?? html.match(reProp2);
    if (m?.[1]) return decodeHtml(m[1].trim());
  }
  return "";
}

function decodeHtml(s: string): string {
  return s
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&nbsp;/g, " ");
}

function absoluteUrl(base: string, maybe: string | null): string | null {
  if (!maybe) return null;
  try {
    return new URL(maybe, base).toString();
  } catch {
    return null;
  }
}

/**
 * Anteprima link (Open Graph / meta) per chat.
 * Nessuna persistenza DB: cache in-memory breve + validazione anti-SSRF.
 */
export async function fetchChatLinkPreviewAction(
  rawUrl: string
): Promise<
  { success: true; preview: ChatLinkPreview } | { success: false; error: string }
> {
  await requireAreaAccess("chat");
  const parsed = urlSchema.safeParse(rawUrl.trim());
  if (!parsed.success) {
    return { success: false, error: "URL non valido." };
  }

  let target: URL;
  try {
    target = new URL(parsed.data);
  } catch {
    return { success: false, error: "URL non valido." };
  }
  if (target.protocol !== "http:" && target.protocol !== "https:") {
    return { success: false, error: "Solo http/https." };
  }
  if (isBlockedHost(target.hostname)) {
    return { success: false, error: "Host non consentito." };
  }

  const cacheKey = target.toString();
  const hit = CACHE.get(cacheKey);
  if (hit && Date.now() - hit.at < TTL_MS) {
    if (!hit.data) return { success: false, error: "Anteprima non disponibile." };
    return { success: true, preview: hit.data };
  }

  try {
    const ctrl = new AbortController();
    const t = setTimeout(() => ctrl.abort(), 6000);
    const res = await fetch(target.toString(), {
      method: "GET",
      redirect: "follow",
      signal: ctrl.signal,
      headers: {
        "User-Agent": "OpuntiaIndustryChatPreview/1.0",
        Accept: "text/html,application/xhtml+xml",
      },
    });
    clearTimeout(t);

    const finalUrl = res.url || target.toString();
    try {
      const finalHost = new URL(finalUrl).hostname;
      if (isBlockedHost(finalHost)) {
        CACHE.set(cacheKey, { at: Date.now(), data: null });
        return { success: false, error: "Host non consentito." };
      }
    } catch {
      /* ignore */
    }

    if (!res.ok) {
      CACHE.set(cacheKey, { at: Date.now(), data: null });
      return { success: false, error: `HTTP ${res.status}` };
    }

    const ctype = (res.headers.get("content-type") ?? "").toLowerCase();
    if (!ctype.includes("text/html") && !ctype.includes("application/xhtml")) {
      const preview: ChatLinkPreview = {
        url: finalUrl,
        title: target.hostname,
        description: "",
        imageUrl: null,
        siteName: target.hostname,
      };
      CACHE.set(cacheKey, { at: Date.now(), data: preview });
      return { success: true, preview };
    }

    const buf = await res.arrayBuffer();
    const slice = buf.byteLength > 350_000 ? buf.slice(0, 350_000) : buf;
    const html = new TextDecoder("utf-8").decode(slice);

    const title =
      metaContent(html, ["og:title", "twitter:title"]) ||
      (html.match(/<title[^>]*>([^<]*)<\/title>/i)?.[1]
        ? decodeHtml(html.match(/<title[^>]*>([^<]*)<\/title>/i)![1].trim())
        : "") ||
      target.hostname;

    const description = metaContent(html, [
      "og:description",
      "twitter:description",
      "description",
    ]).slice(0, 400);

    const imageRaw = metaContent(html, [
      "og:image",
      "og:image:url",
      "twitter:image",
      "twitter:image:src",
    ]);
    const imageUrl = absoluteUrl(finalUrl, imageRaw || null);

    const siteName =
      metaContent(html, ["og:site_name"]) || new URL(finalUrl).hostname;

    const preview: ChatLinkPreview = {
      url: finalUrl,
      title: title.slice(0, 200) || siteName,
      description,
      imageUrl,
      siteName: siteName.slice(0, 120),
    };
    CACHE.set(cacheKey, { at: Date.now(), data: preview });
    return { success: true, preview };
  } catch {
    CACHE.set(cacheKey, { at: Date.now(), data: null });
    return { success: false, error: "Anteprima non disponibile." };
  }
}
