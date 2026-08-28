import type { PnNotaBozzaPlaceholder } from "@/lib/promemorie-e-note/types";

/** Token in template: {{key|Label o sample}} */
export const PLACEHOLDER_TOKEN_RE =
  /\{\{([a-zA-Z0-9_]+)\|([^}]*)\}\}/g;

export function makePlaceholderToken(key: string, label: string): string {
  const safeKey = key.replace(/[^a-zA-Z0-9_]/g, "_").slice(0, 40) || "campo";
  const safeLabel = (label || safeKey).replace(/[{}]/g, "").slice(0, 120);
  return `{{${safeKey}|${safeLabel}}}`;
}

export function nextPlaceholderKey(
  existing: PnNotaBozzaPlaceholder[]
): string {
  let n = existing.length + 1;
  const keys = new Set(existing.map((p) => p.key));
  while (keys.has(`campo_${n}`)) n += 1;
  return `campo_${n}`;
}

/** Testo piano da body_rich (togli link markdown e token placeholder → sample). */
export function richToPlain(rich: string): string {
  return (rich || "")
    .replace(/\[([^\]]+)\]\(([^)]+)\)/g, "$1")
    .replace(PLACEHOLDER_TOKEN_RE, (_m, _key, label: string) => label || "")
    .trim();
}

export function formatMarkdownLink(label: string, url: string): string {
  const t = (label || url).replace(/[\[\]]/g, "").trim() || url;
  const u = url.trim();
  return `[${t}](${u})`;
}

export function applyPlaceholderValues(
  template: string,
  values: Record<string, string>
): string {
  return (template || "").replace(
    PLACEHOLDER_TOKEN_RE,
    (_m, key: string, label: string) => {
      const v = values[key];
      if (v != null && String(v).length > 0) return String(v);
      return label || "";
    }
  );
}

export type TemplateSegment =
  | { kind: "text"; text: string }
  | { kind: "ph"; key: string; label: string };

export function splitTemplateSegments(template: string): TemplateSegment[] {
  const out: TemplateSegment[] = [];
  const re = new RegExp(PLACEHOLDER_TOKEN_RE.source, "g");
  let last = 0;
  let m: RegExpExecArray | null;
  while ((m = re.exec(template))) {
    if (m.index > last) {
      out.push({ kind: "text", text: template.slice(last, m.index) });
    }
    out.push({ kind: "ph", key: m[1], label: m[2] || m[1] });
    last = m.index + m[0].length;
  }
  if (last < template.length) {
    out.push({ kind: "text", text: template.slice(last) });
  }
  if (out.length === 0) out.push({ kind: "text", text: template || "" });
  return out;
}

export function ensureHttpUrl(raw: string): string | null {
  const t = raw.trim();
  if (!t) return null;
  if (/^https?:\/\//i.test(t)) return t;
  if (/^[\w.-]+\.[\w.-]+(\/.*)?$/i.test(t)) return `https://${t}`;
  return null;
}
