export type TutorialBlock =
  | { type: "p"; text: string }
  | { type: "h"; text: string }
  | { type: "ul"; items: string[] }
  | { type: "ol"; items: string[] }
  | { type: "code"; text: string; caption?: string }
  | { type: "note"; text: string }
  | { type: "warn"; text: string }
  | { type: "table"; headers: string[]; rows: string[][] };

export type TutorialMaturity = "completo" | "parziale" | "placeholder";

export type TutorialArticle = {
  id: string;
  sectionId: string;
  sectionTitle: string;
  title: string;
  summary: string;
  path?: string;
  maturity?: TutorialMaturity;
  tags: string[];
  blocks: TutorialBlock[];
  searchText: string;
};

export type TutorialSection = {
  id: string;
  title: string;
};

export const TUTORIAL_SECTIONS: TutorialSection[] = [
  { id: "guida", title: "Guida" },
  { id: "lotti", title: "Lotti e numerazioni" },
  { id: "dashboard", title: "Dashboard" },
  { id: "amministrazione", title: "Amministrazione" },
  { id: "web", title: "Web (Opuntia Italia e Wiki)" },
  { id: "ricerca-sviluppo", title: "Ricerca e sviluppo" },
  { id: "produzione", title: "Produzione" },
  { id: "action", title: "Action (IoT)" },
  { id: "chat", title: "Chat" },
  { id: "webmail", title: "WebMail" },
  { id: "magazzino", title: "Magazzino" },
  { id: "promemorie-e-note", title: "Promemorie e note" },
  { id: "area-fiscale", title: "Area Fiscale" },
  { id: "strumenti", title: "Strumenti" },
  { id: "area-fornitori", title: "Gestionale Fornitori" },
  { id: "impostazioni", title: "Impostazioni" },
  { id: "archivio", title: "Archivio" },
  { id: "qualita", title: "Qualità, ruoli e prove" },
  { id: "nascoste", title: "Aree nascoste o in arrivo" },
];

export function normalizeSearch(raw: string): string {
  return raw
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9./-]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

export function searchTokens(raw: string): string[] {
  return normalizeSearch(raw)
    .split(" ")
    .filter((t) => t.length >= 1);
}

export function articleMatches(article: TutorialArticle, query: string): boolean {
  const tokens = searchTokens(query);
  if (tokens.length === 0) return true;
  const hay = article.searchText;
  return tokens.every((t) => hay.includes(t));
}

export function buildSearchText(input: {
  title: string;
  summary: string;
  path?: string;
  tags: string[];
  blocks: TutorialBlock[];
}): string {
  const parts: string[] = [
    input.title,
    input.summary,
    input.path ?? "",
    ...input.tags,
  ];
  for (const b of input.blocks) {
    if (b.type === "p" || b.type === "h" || b.type === "note" || b.type === "warn") {
      parts.push(b.text);
    } else if (b.type === "code") {
      parts.push(b.text, b.caption ?? "");
    } else if (b.type === "ul" || b.type === "ol") {
      parts.push(...b.items);
    } else if (b.type === "table") {
      parts.push(...b.headers, ...b.rows.flat());
    }
  }
  return normalizeSearch(parts.join(" "));
}

export function makeArticle(
  input: Omit<TutorialArticle, "searchText">
): TutorialArticle {
  return {
    ...input,
    searchText: buildSearchText(input),
  };
}

export function pathToArticleId(path: string): string {
  return `pagina-${path.replace(/^\/+/, "").replace(/\//g, "-")}`;
}
