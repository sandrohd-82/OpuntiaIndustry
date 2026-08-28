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

/**
 * Riscrive cid:… → URL allegati; forza link in nuova scheda;
 * wrappa in documento HTML minimo se manca struttura.
 */
export function rewriteWebmailHtml(input: {
  html: string;
  cidMap: Record<string, string>;
}): string {
  let html = input.html || "";
  if (!html.trim()) return "";

  // cid:xxx (anche URL-encoded e con <>)
  html = html.replace(
    /(?:src|href)\s*=\s*(["'])\s*cid:([^"']+)\1/gi,
    (full, quote: string, cidRaw: string) => {
      const key = normalizeContentId(decodeURIComponent(cidRaw));
      const url =
        input.cidMap[key] ||
        input.cidMap[key.toLowerCase()] ||
        Object.entries(input.cidMap).find(
          ([k]) => k.toLowerCase() === key.toLowerCase()
        )?.[1];
      if (!url) return full;
      const attr = full.toLowerCase().startsWith("href") ? "href" : "src";
      return `${attr}=${quote}${url}${quote}`;
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
  if (looksComplete) return html;

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
