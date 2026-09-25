/** Unisce copie della stessa mail arrivate su caselle diverse (ISO: nessuna cancellazione). */

export type MailDedupeInput = {
  id: string;
  messageIdHeader?: string | null;
  direction: "inbound" | "outbound";
  subject: string;
  fromAddress: string;
  occurredAt: string;
};

export function normalizeMessageIdHeader(
  header: string | null | undefined
): string {
  return (header ?? "")
    .trim()
    .toLowerCase()
    .replace(/^<|>$/g, "")
    .replace(/\s+/g, "");
}

export function mailFallbackKey(input: {
  direction: "inbound" | "outbound";
  subject: string;
  fromAddress: string;
  occurredAt: string;
}): string {
  const when = input.occurredAt.trim().slice(0, 19);
  const subj = input.subject.trim().toLowerCase().replace(/\s+/g, " ");
  const from = input.fromAddress.trim().toLowerCase();
  return `${input.direction}|${when}|${from}|${subj}`;
}

export function groupMailCopies<T extends MailDedupeInput>(rows: T[]): T[][] {
  const items = rows.filter((r) => r.occurredAt);
  if (items.length === 0) return [];
  const parent = items.map((_, i) => i);
  function find(i: number): number {
    if (parent[i] !== i) parent[i] = find(parent[i]);
    return parent[i];
  }
  function union(a: number, b: number) {
    const pa = find(a);
    const pb = find(b);
    if (pa !== pb) parent[pa] = pb;
  }

  const byMid = new Map<string, number>();
  const byFb = new Map<string, number>();
  items.forEach((r, i) => {
    const mid = normalizeMessageIdHeader(r.messageIdHeader);
    if (mid) {
      const j = byMid.get(mid);
      if (j !== undefined) union(i, j);
      else byMid.set(mid, i);
    }
    const fb = mailFallbackKey(r);
    const k = byFb.get(fb);
    if (k !== undefined) union(i, k);
    else byFb.set(fb, i);
  });

  const groups = new Map<number, T[]>();
  items.forEach((r, i) => {
    const p = find(i);
    const list = groups.get(p) ?? [];
    list.push(r);
    groups.set(p, list);
  });
  return [...groups.values()];
}

export function uniqueCaselleEmails(emails: string[]): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const raw of emails) {
    const e = raw.trim();
    if (!e) continue;
    const key = e.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(e);
  }
  out.sort((a, b) => a.localeCompare(b, "it"));
  return out;
}

export function formatMailCaselleNote(
  emails: string[],
  direction: "inbound" | "outbound"
): string | null {
  const unique = uniqueCaselleEmails(emails);
  if (unique.length < 2) return null;
  const elenco =
    unique.length === 2
      ? `${unique[0]} e ${unique[1]}`
      : `${unique.slice(0, -1).join(", ")} e ${unique[unique.length - 1]}`;
  return direction === "outbound"
    ? `Presente in ${elenco}`
    : `Ricevuta in ${elenco}`;
}

export function preferLongerName(...names: Array<string | null | undefined>): string {
  let best = "";
  for (const raw of names) {
    const n = (raw ?? "").trim();
    if (n.length > best.length) best = n;
  }
  return best;
}
