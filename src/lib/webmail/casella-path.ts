import type { WebmailMailboxView } from "@/lib/webmail/types";

/** UUID (anche v7): non bloccare le rotte cartella con il check RFC 1–5. */
export const WEBMAIL_UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export function isWebmailUuid(value: string): boolean {
  return WEBMAIL_UUID_RE.test(value.trim());
}

export type WebmailCasellaFolder =
  | { kind: "inbox"; view: Extract<WebmailMailboxView, "inbox">; categoriaId: null }
  | { kind: "categoria"; view: Extract<WebmailMailboxView, "categoria">; categoriaId: string }
  | { kind: "bozze"; view: Extract<WebmailMailboxView, "bozze">; categoriaId: null }
  | { kind: "spam"; view: Extract<WebmailMailboxView, "spam">; categoriaId: null }
  | { kind: "cestino"; view: Extract<WebmailMailboxView, "cestino">; categoriaId: null }
  | { kind: "nuova"; view: null; categoriaId: null };

export function parseWebmailCasellaFolder(
  pathname: string,
  accountId: string
): WebmailCasellaFolder {
  const base = `/app/webmail/caselle/${accountId}`;
  const raw = (pathname.split("?")[0] ?? "").replace(/\/+$/, "") || pathname;
  if (raw === `${base}/nuova`) {
    return { kind: "nuova", view: null, categoriaId: null };
  }
  if (raw === `${base}/bozze`) {
    return { kind: "bozze", view: "bozze", categoriaId: null };
  }
  if (raw === `${base}/spam`) {
    return { kind: "spam", view: "spam", categoriaId: null };
  }
  if (raw === `${base}/cestino`) {
    return { kind: "cestino", view: "cestino", categoriaId: null };
  }
  const catPrefix = `${base}/categoria/`;
  if (raw.startsWith(catPrefix)) {
    const categoriaId = raw.slice(catPrefix.length).split("/")[0] ?? "";
    if (isWebmailUuid(categoriaId)) {
      return { kind: "categoria", view: "categoria", categoriaId };
    }
  }
  return { kind: "inbox", view: "inbox", categoriaId: null };
}
