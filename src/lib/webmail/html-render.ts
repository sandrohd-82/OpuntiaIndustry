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

const WEBMAIL_LINK_INFO_CSS = `<style id="oi-link-info">
a.oi-link-info, button.oi-link-info, input.oi-link-info {
  position: relative;
}
a.oi-link-info:hover::before,
a.oi-link-info:focus::before {
  content: "Destinazione: " attr(href);
}
button.oi-link-info:hover::before,
button.oi-link-info:focus::before,
input.oi-link-info:hover::before,
input.oi-link-info:focus::before {
  content: "Pulsante contenuto nella mail. Controlla sempre dove porta prima di cliccare.";
}
a.oi-link-info:hover::before,
a.oi-link-info:focus::before,
button.oi-link-info:hover::before,
button.oi-link-info:focus::before,
input.oi-link-info:hover::before,
input.oi-link-info:focus::before {
  position: absolute;
  left: 50%;
  bottom: calc(100% + 8px);
  transform: translateX(-50%);
  z-index: 2147483647;
  width: max-content;
  max-width: min(22rem, 72vw);
  padding: 8px 12px;
  background: #fff;
  color: #0f172a;
  border: 1px solid #e0f2fe;
  border-radius: 16px;
  box-shadow: 0 8px 24px rgba(15, 23, 42, 0.16);
  font-size: 11px;
  line-height: 1.4;
  font-weight: 400;
  font-family: system-ui, Segoe UI, sans-serif;
  word-break: break-all;
  white-space: pre-wrap;
  pointer-events: none;
}
</style>`;

function ensureInfoClass(attrs: string): string {
  if (/\bclass\s*=\s*"/i.test(attrs)) {
    return attrs.replace(/\bclass\s*=\s*"/i, 'class="oi-link-info ');
  }
  if (/\bclass\s*=\s*'/i.test(attrs)) {
    return attrs.replace(/\bclass\s*=\s*'/i, "class='oi-link-info ");
  }
  if (/\bclass\s*=/i.test(attrs)) {
    return attrs.replace(/\bclass\s*=/i, 'class="oi-link-info ');
  }
  return `${attrs} class="oi-link-info"`;
}

function decorateMailInteractiveTags(html: string): string {
  let out = html.replace(/<a\b([^>]*)>/gi, (_m, attrs: string) => {
    let a = ensureInfoClass(attrs);
    if (!/\btarget\s*=/i.test(a)) a += ' target="_blank"';
    if (!/\brel\s*=/i.test(a)) a += ' rel="noopener noreferrer"';
    return `<a${a}>`;
  });
  out = out.replace(/<button\b([^>]*)>/gi, (_m, attrs: string) => {
    return `<button${ensureInfoClass(attrs)}>`;
  });
  out = out.replace(/<input\b([^>]*)>/gi, (full, attrs: string) => {
    if (!/\btype\s*=\s*["']?(button|submit|reset|image)/i.test(attrs)) {
      return full;
    }
    return `<input${ensureInfoClass(attrs)}>`;
  });
  return out;
}

function injectLinkInfoCss(html: string): string {
  if (/id=["']oi-link-info["']/.test(html)) return html;
  if (/<head[^>]*>/i.test(html)) {
    return html.replace(/<head([^>]*)>/i, `<head$1>${WEBMAIL_LINK_INFO_CSS}`);
  }
  if (/<html[^>]*>/i.test(html)) {
    return html.replace(
      /<html([^>]*)>/i,
      `<html$1><head>${WEBMAIL_LINK_INFO_CSS}</head>`
    );
  }
  return `${WEBMAIL_LINK_INFO_CSS}${html}`;
}

/**
 * Riscrive cid:… → URL allegati; rimuove CSP che blocca le immagini;
 * forza link in nuova scheda; nuvola info al passaggio su link/pulsanti;
 * wrappa in documento HTML minimo se serve.
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

  html = decorateMailInteractiveTags(html);

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
    return injectLinkInfoCss(html);
  }

  return injectLinkInfoCss(`<!DOCTYPE html>
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
</html>`);
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
