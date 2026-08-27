/**
 * Apprendimento categorie WebMail (ISO 9001).
 * Soglie: 2 = suggest, 4 = auto_notify, 6 = auto_silent.
 */

export const WEBMAIL_LEARN_SUGGEST_AT = Number(
  process.env.WEBMAIL_CATEGORY_LEARN_SUGGEST ?? "2"
);
export const WEBMAIL_LEARN_AUTO_NOTIFY_AT = Number(
  process.env.WEBMAIL_CATEGORY_LEARN_AUTO_NOTIFY ?? "4"
);
export const WEBMAIL_LEARN_AUTO_SILENT_AT = Number(
  process.env.WEBMAIL_CATEGORY_LEARN_AUTO_SILENT ?? "6"
);

export type WebmailLearnMode =
  | "learning"
  | "suggest"
  | "auto_notify"
  | "auto_silent";

export type WebmailCategoriaRegola = {
  id: string;
  accountId: string | null;
  matchType: "email" | "domain";
  matchKey: string;
  categoriaId: string;
  confirmCount: number;
  mode: WebmailLearnMode;
};

export function modeFromConfirmCount(count: number): WebmailLearnMode {
  if (count >= WEBMAIL_LEARN_AUTO_SILENT_AT) return "auto_silent";
  if (count >= WEBMAIL_LEARN_AUTO_NOTIFY_AT) return "auto_notify";
  if (count >= WEBMAIL_LEARN_SUGGEST_AT) return "suggest";
  return "learning";
}

export function normalizeSenderEmail(raw: string): string {
  return raw.trim().toLowerCase();
}

export function domainFromEmail(email: string): string | null {
  const e = normalizeSenderEmail(email);
  const at = e.lastIndexOf("@");
  if (at < 1 || at === e.length - 1) return null;
  return e.slice(at + 1);
}

export function slugifyCategoriaCodice(nome: string): string {
  const base = nome
    .trim()
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^_|_$/g, "")
    .slice(0, 40);
  return base || `cat_${Date.now().toString(36)}`;
}
