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

/** Palette colori distinti per categorie (standard + custom). */
export const WEBMAIL_CATEGORIA_COLOR_PALETTE = [
  "#16a34a", // Preventivi
  "#2563eb", // Ordini
  "#0891b2", // Info
  "#c026d3", // Pubblicità
  "#f59e0b", // Generico
  "#dc2626",
  "#ea580c",
  "#65a30d",
  "#0d9488",
  "#7c3aed",
  "#db2777",
  "#0284c7",
  "#4f46e5",
  "#a16207",
  "#475569",
] as const;

export const WEBMAIL_STANDARD_CATEGORIE: Array<{
  codice: string;
  nome: string;
  colore: string;
  sortOrder: number;
}> = [
  { codice: "preventivi", nome: "Preventivi", colore: "#16a34a", sortOrder: 10 },
  { codice: "ordini", nome: "Ordini", colore: "#2563eb", sortOrder: 20 },
  { codice: "info", nome: "Info", colore: "#0891b2", sortOrder: 30 },
  { codice: "pubblicita", nome: "Pubblicità", colore: "#c026d3", sortOrder: 40 },
  { codice: "generico", nome: "Generico", colore: "#f59e0b", sortOrder: 50 },
];

/** Primo colore della palette non ancora usato (case-insensitive). */
export function pickUnusedCategoriaColore(used: string[]): string {
  const taken = new Set(used.map((c) => c.trim().toLowerCase()));
  for (const c of WEBMAIL_CATEGORIA_COLOR_PALETTE) {
    if (!taken.has(c.toLowerCase())) return c;
  }
  // fallback: hash casuale ma valido
  const n = Math.floor(Math.random() * 0xffffff);
  return `#${n.toString(16).padStart(6, "0")}`;
}
