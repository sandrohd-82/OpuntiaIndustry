import { z } from "zod";

export const CONTATTO_CANALE_KINDS = ["email", "telefono"] as const;
export type ContattoCanaleKind = (typeof CONTATTO_CANALE_KINDS)[number];

export type ContattoCanaleAttenzione = {
  id: string;
  canale: ContattoCanaleKind;
  valoreNormalizzato: string;
  valoreDisplay: string;
  clausola: string;
  updatedAt: string | null;
};

export function normalizeCanaleEmail(raw: string): string {
  const t = raw.trim().toLowerCase();
  const angled = t.match(/<([^>]+@[^>]+)>/);
  return (angled?.[1] ?? t).trim();
}

export function normalizeCanaleTelefono(raw: string): string {
  const t = raw.trim();
  if (!t) return "";
  const plus = t.startsWith("+");
  const digits = t.replace(/\D/g, "");
  if (!digits) return "";
  return plus ? `+${digits}` : digits;
}

export function normalizeCanaleValore(
  canale: ContattoCanaleKind,
  raw: string
): string {
  return canale === "email"
    ? normalizeCanaleEmail(raw)
    : normalizeCanaleTelefono(raw);
}

export function parseCanaleEmailList(raw: string): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const part of raw.split(/[,;]/)) {
    const n = normalizeCanaleEmail(part);
    if (!n || !n.includes("@") || seen.has(n)) continue;
    seen.add(n);
    out.push(n);
  }
  return out;
}

export function telHref(raw: string): string {
  const n = normalizeCanaleTelefono(raw);
  return n ? `tel:${n}` : "";
}

export const upsertCanaleAttenzioneSchema = z.object({
  canale: z.enum(CONTATTO_CANALE_KINDS),
  valore: z.string().trim().min(1).max(160),
  clausola: z.string().trim().min(1).max(2000),
});

export const lookupCanaleAttenzioneSchema = z.object({
  canale: z.enum(CONTATTO_CANALE_KINDS),
  valore: z.string().trim().min(1).max(160),
});

export const lookupManyCanaleAttenzioneSchema = z.object({
  emails: z.array(z.string().trim().max(160)).max(30).optional().default([]),
  telefoni: z.array(z.string().trim().max(160)).max(30).optional().default([]),
});
