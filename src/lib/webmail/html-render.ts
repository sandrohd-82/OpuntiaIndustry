/** Bucket allegati messaggi WebMail (inline CID + file). */
export const WEBMAIL_ALLEGATI_BUCKET = "webmail-allegati";

export type WebmailCidMapEntry = {
  contentId: string;
  url: string;
  filename: string;
  isInline: boolean;
};

/** Normalizza Content-ID (togli <> e spazi). */
export function normalizeContentId(raw: string | undefined | null): string {
  return String(raw ?? "")
    .trim()
    .replace(/^<|>$/g, "")
    .trim();
}

/** Risolve URL da mappa CID (match case-insensitive / senza dominio). */
export function resolveCidUrl(
  cidRaw: string,
  cidMap: Record<string, string>
): string | null {
  let key = normalizeContentId(cidRaw);
  try {
    key = normalizeContentId(decodeURIComponent(key));
  } catch {
    // ignore decode errors
  }
  if (!key) return null;

  const direct =
    cidMap[key] ||
    cidMap[key.toLowerCase()] ||
    Object.entries(cidMap).find(([k]) => k.toLowerCase() === key.toLowerCase())?.[1];
  if (direct) return direct;

  // Match solo parte locale (prima di @) — alcuni client omettono il dominio
  const local = key.split("@")[0]!.toLowerCase();
  if (!local) return null;
  const byLocal = Object.entries(cidMap).find(([k]) => {
    const kl = k.toLowerCase();
    return kl === local || kl.split("@")[0] === local;
  })?.[1];
  return byLocal ?? null;
}

/**
 * Normalizza Content-Type allegati email → MIME accettati da Storage.
 */
export function normalizeAttachmentMime(raw: string | undefined | null): string {
  const base = (raw || "application/octet-stream").split(";")[0]!.trim().toLowerCase();
  const map: Record<string, string> = {
    "image/jpg": "image/jpeg",
    "image/pjpeg": "image/jpeg",
    "image/x-png": "image/png",
    "image/x-icon": "image/vnd.microsoft.icon",
    "image/ico": "image/vnd.microsoft.icon",
    "application/x-pdf": "application/pdf",
  };
  return map[base] || base || "application/octet-stream";
}

/**
 * Riscrive cid:… → URL allegati; rimuove CSP che blocca le immagini;
 * forza link in nuova scheda; wrappa in documento HTML minimo se serve.
 */
export function rewriteWebmailHtml(input: {
  html: string;
  cidMap: Record<string, string>;
}): string {
  let html = input.html || "";
  if (!html.trim()) return "";

  // CSP nelle mail marketing spesso blocca img/data:/signed URL
  html = html.replace(
    /<meta[^>]+http-equiv\s*=\s*["']?Content-Security-Policy["']?[^>]*>/gi,
    ""
  );
  html = html.replace(
    /<meta[^>]+http-equiv\s*=\s*["']?X-Content-Security-Policy["']?[^>]*>/gi,
    ""
  );

  // src / href = "cid:…" | 'cid:…' | cid:… (senza virgolette)
  html = html.replace(
    /\b(src|href|background)\s*=\s*(["'])\s*cid:([^"']+)\2/gi,
    (_full, attr: string, quote: string, cidRaw: string) => {
      const url = resolveCidUrl(cidRaw, input.cidMap);
      if (!url) return `${attr}=${quote}cid:${cidRaw}${quote}`;
      return `${attr}=${quote}${url}${quote}`;
    }
  );
  html = html.replace(
    /\b(src|href|background)\s*=\s*cid:([^\s>"']+)/gi,
    (_full, attr: string, cidRaw: string) => {
      const url = resolveCidUrl(cidRaw, input.cidMap);
      if (!url) return `${attr}=cid:${cidRaw}`;
      return `${attr}="${url}"`;
    }
  );

  // CSS url(cid:…) / url("cid:…")
  html = html.replace(
    /url\(\s*(['"]?)\s*cid:([^)'"\s]+)\1\s*\)/gi,
    (_full, _q: string, cidRaw: string) => {
      const url = resolveCidUrl(cidRaw, input.cidMap);
      if (!url) return `url(cid:${cidRaw})`;
      return `url("${url}")`;
    }
  );

  // Link esterni → nuova scheda
  html = html.replace(/<a\b([^>]*)>/gi, (_m, attrs: string) => {
    let a = attrs;
    if (!/\btarget\s*=/i.test(a)) a += ' target="_blank"';
    if (!/\brel\s*=/i.test(a)) a += ' rel="noopener noreferrer"';
    return `<a${a}>`;
  });

  const looksComplete =
    /<html[\s>]/i.test(html) || /<!DOCTYPE\s+html/i.test(html);
  if (looksComplete) {
    // Assicura img responsive anche su HTML completi
    if (!/<style[\s>][^>]*>[\s\S]*img\s*\{/i.test(html)) {
      html = html.replace(
        /<head([^>]*)>/i,
        `<head$1><style>img{max-width:100%;height:auto;}</style>`
      );
    }
    return html;
  }

  return `<!DOCTYPE html>
<html>
<head>
<meta charset="utf-8"/>
<meta name="viewport" content="width=device-width, initial-scale=1"/>
<base target="_blank"/>
<style>
  body { margin: 12px; font-family: system-ui, Segoe UI, sans-serif; color: #0f172a; word-wrap: break-word; }
  img { max-width: 100%; height: auto; }
</style>
</head>
<body>
${html}
</body>
</html>`;
}

export function extractPlainFromHtml(html: string): string {
  return String(html || "")
    .replace(/<style[\s\S]*?<\/style>/gi, " ")
    .replace(/<script[\s\S]*?<\/script>/gi, " ")
    .replace(/<[^>]+>/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

/** Soglia per embed data: invece di signed URL (iframe più affidabile). */
export const WEBMAIL_INLINE_DATA_URL_MAX_BYTES = 1_500_000;

export function bufferToDataUrl(mime: string, buf: Buffer): string {
  const safe = normalizeAttachmentMime(mime);
  return `data:${safe};base64,${buf.toString("base64")}`;
}
