export const ATTIVITA_MENTION_KINDS = [
  "operatore",
  "fornitore",
  "rubrica",
  "materia_prima",
  "servizio",
  "prodotto",
  "prodotto_agrinsicilia",
  "cliente",
  "cliente_possibile",
  "preventivo",
  "ordine",
  "campionatura",
  "mail",
] as const;

export type AttivitaMentionKind = (typeof ATTIVITA_MENTION_KINDS)[number];

export type AttivitaMentionSpec = {
  kind: AttivitaMentionKind;
  /** Corpo dopo @, vuoto per operatori. */
  prefix: string;
  label: string;
  example: string;
};

/** Match dal più lungo: Pa/Pc/Pr prima di P, Oc prima di O, Wm/Mp/Sz. */
export const ATTIVITA_MENTION_SPECS: readonly AttivitaMentionSpec[] = [
  { kind: "mail", prefix: "Wm-", label: "Mail", example: "@Wm-" },
  { kind: "materia_prima", prefix: "Mp-", label: "Materia prima", example: "@Mp-Nome" },
  { kind: "campionatura", prefix: "Oc-", label: "Ordini campionature", example: "@Oc-Nome" },
  { kind: "cliente_possibile", prefix: "Pc-", label: "Possibile cliente", example: "@Pc-Nome" },
  { kind: "prodotto_agrinsicilia", prefix: "Pa-", label: "Prodotti Agrinsicilia", example: "@Pa-Nome" },
  { kind: "preventivo", prefix: "Pr-", label: "Preventivi", example: "@Pr-Nome" },
  { kind: "servizio", prefix: "Sz-", label: "Servizi", example: "@Sz-Nome" },
  { kind: "fornitore", prefix: "F-", label: "Fornitori", example: "@F-Nome" },
  { kind: "rubrica", prefix: "R-", label: "Rubrica", example: "@R-Nome" },
  { kind: "prodotto", prefix: "P-", label: "Prodotti", example: "@P-Nome" },
  { kind: "cliente", prefix: "C-", label: "Clienti", example: "@C-Nome" },
  { kind: "ordine", prefix: "O-", label: "Ordini", example: "@O-Nome" },
  { kind: "operatore", prefix: "", label: "Operatori", example: "@Nome" },
];

export const ATTIVITA_MENTION_LEGGENDA: readonly AttivitaMentionSpec[] = [
  ATTIVITA_MENTION_SPECS.find((s) => s.kind === "operatore")!,
  ATTIVITA_MENTION_SPECS.find((s) => s.kind === "fornitore")!,
  ATTIVITA_MENTION_SPECS.find((s) => s.kind === "rubrica")!,
  ATTIVITA_MENTION_SPECS.find((s) => s.kind === "materia_prima")!,
  ATTIVITA_MENTION_SPECS.find((s) => s.kind === "servizio")!,
  ATTIVITA_MENTION_SPECS.find((s) => s.kind === "prodotto")!,
  ATTIVITA_MENTION_SPECS.find((s) => s.kind === "prodotto_agrinsicilia")!,
  ATTIVITA_MENTION_SPECS.find((s) => s.kind === "cliente")!,
  ATTIVITA_MENTION_SPECS.find((s) => s.kind === "cliente_possibile")!,
  ATTIVITA_MENTION_SPECS.find((s) => s.kind === "preventivo")!,
  ATTIVITA_MENTION_SPECS.find((s) => s.kind === "ordine")!,
  ATTIVITA_MENTION_SPECS.find((s) => s.kind === "campionatura")!,
  ATTIVITA_MENTION_SPECS.find((s) => s.kind === "mail")!,
];

export type PnAttivitaCollegamento = {
  id?: string;
  kind: AttivitaMentionKind;
  entityId: string;
  entityLabel: string;
  token: string;
  meta?: Record<string, unknown>;
};

export type AttivitaMentionHit = {
  entityId: string;
  label: string;
  hint?: string;
  meta?: Record<string, unknown>;
};

export type ActiveMention = {
  start: number;
  end: number;
  kind: AttivitaMentionKind;
  prefix: string;
  query: string;
};

export function specForKind(kind: AttivitaMentionKind): AttivitaMentionSpec {
  return ATTIVITA_MENTION_SPECS.find((s) => s.kind === kind)!;
}

export function matchMentionPrefix(afterAt: string): {
  spec: AttivitaMentionSpec;
  query: string;
} {
  const raw = afterAt;
  for (const spec of ATTIVITA_MENTION_SPECS) {
    if (!spec.prefix) continue;
    const low = raw.toLowerCase();
    const p = spec.prefix.toLowerCase();
    if (low.startsWith(p)) {
      return { spec, query: raw.slice(spec.prefix.length) };
    }
  }
  return {
    spec: specForKind("operatore"),
    query: raw,
  };
}

export function detectActiveMention(
  text: string,
  cursor: number
): ActiveMention | null {
  const before = text.slice(0, cursor);
  const at = before.lastIndexOf("@");
  if (at < 0) return null;
  if (at > 0 && !/\s/.test(text[at - 1] ?? " ")) return null;
  const afterAt = before.slice(at + 1);
  if (afterAt.includes("\n")) return null;
  const { spec, query } = matchMentionPrefix(afterAt);
  return {
    start: at,
    end: cursor,
    kind: spec.kind,
    prefix: spec.prefix,
    query,
  };
}

export function buildMentionToken(
  kind: AttivitaMentionKind,
  label: string,
  entityId?: string
): string {
  const spec = specForKind(kind);
  const clean = label.replace(/@/g, "").replace(/\s+/g, " ").trim() || "item";
  const base = `@${spec.prefix}${clean}`;
  if (entityId && clean.length < 2) {
    return `${base} ${entityId.slice(0, 6)}`;
  }
  return base;
}

export function insertMentionToken(
  text: string,
  start: number,
  end: number,
  token: string
): { text: string; cursor: number } {
  const before = text.slice(0, start);
  const after = text.slice(end);
  const needsSpaceAfter = after.length > 0 && !/^\s/.test(after);
  const inserted = `${token}${needsSpaceAfter ? " " : " "}`;
  const next = `${before}${inserted}${after}`;
  return { text: next, cursor: before.length + inserted.length };
}

export function collegamentiStillInText(
  text: string,
  items: PnAttivitaCollegamento[]
): PnAttivitaCollegamento[] {
  return items.filter((c) => c.token && text.includes(c.token));
}

export function mentionHref(item: PnAttivitaCollegamento): string | null {
  switch (item.kind) {
    case "cliente":
      return "/app/amministrazione/anagrafiche/clienti";
    case "cliente_possibile":
      return "/app/amministrazione/anagrafiche/possibili-clienti";
    case "fornitore":
      return "/app/amministrazione/anagrafiche/fornitori";
    case "rubrica":
      return "/app/amministrazione/anagrafiche/rubrica";
    case "prodotto":
    case "prodotto_agrinsicilia":
      return "/app/amministrazione/schede/prodotti";
    case "materia_prima":
      return "/app/amministrazione/schede/materie-prime";
    case "servizio":
      return "/app/amministrazione/schede/servizi";
    case "preventivo":
      return "/app/amministrazione/preventivi/elenco";
    case "ordine":
      return "/app/amministrazione/ordini/elenco";
    case "campionatura":
      return "/app/amministrazione/ordini/elenco";
    case "mail":
      return "/app/webmail/caselle";
    default:
      return null;
  }
}

export function splitDescriptionMentions(
  text: string,
  collegamenti: PnAttivitaCollegamento[]
): Array<{ type: "text" | "mention"; value: string; link?: PnAttivitaCollegamento }> {
  if (!text) return [];
  const sorted = [...collegamenti]
    .filter((c) => c.token && text.includes(c.token))
    .sort((a, b) => b.token.length - a.token.length);
  if (sorted.length === 0) return [{ type: "text", value: text }];

  const parts: Array<{
    type: "text" | "mention";
    value: string;
    link?: PnAttivitaCollegamento;
  }> = [];
  let rest = text;
  while (rest.length > 0) {
    let earliest = -1;
    let hit: PnAttivitaCollegamento | null = null;
    for (const c of sorted) {
      const i = rest.indexOf(c.token);
      if (i < 0) continue;
      if (earliest < 0 || i < earliest) {
        earliest = i;
        hit = c;
      }
    }
    if (earliest < 0 || !hit) {
      parts.push({ type: "text", value: rest });
      break;
    }
    if (earliest > 0) {
      parts.push({ type: "text", value: rest.slice(0, earliest) });
    }
    parts.push({ type: "mention", value: hit.token, link: hit });
    rest = rest.slice(earliest + hit.token.length);
  }
  return parts;
}
