import { z } from "zod";

export const SPEDIZIONE_MAIL_ENTITY = ["campionatura", "ordine"] as const;
export const SPEDIZIONE_MAIL_STATI = [
  "prenotata",
  "pronta",
  "inviata",
  "annullata",
] as const;

export type SpedizioneMailEntity = (typeof SPEDIZIONE_MAIL_ENTITY)[number];
export type SpedizioneMailStato = (typeof SPEDIZIONE_MAIL_STATI)[number];

export type SpedizioneMailAllegato = {
  path: string;
  name: string;
  contentType: string;
};

export type SpedizioneMailPrenotazione = {
  id: string;
  entityType: SpedizioneMailEntity;
  entityId: string;
  stato: SpedizioneMailStato;
  documentoStato: "bozza" | "approvato" | "chiuso";
  versione: number;
  trackingUrl: string;
  letteraViaPath: string;
  letteraViaName: string;
  allegati: SpedizioneMailAllegato[];
  allegaTracking: boolean;
  allegaLettera: boolean;
  allegaFile: boolean;
  destinatarioEmail: string;
  oggetto: string;
  corpo: string;
  accountId: string | null;
  prenotataAt: string | null;
  inviataAt: string | null;
};

export const spedizioneMailUpsertSchema = z.object({
  id: z.string().uuid().optional(),
  entityType: z.enum(SPEDIZIONE_MAIL_ENTITY),
  entityId: z.string().uuid(),
  trackingUrl: z.string().trim().max(2000).optional().default(""),
  letteraViaPath: z.string().trim().max(500).optional().default(""),
  letteraViaName: z.string().trim().max(240).optional().default(""),
  allegati: z
    .array(
      z.object({
        path: z.string().trim().min(1),
        name: z.string().trim().min(1).max(240),
        contentType: z.string().trim().max(120).optional().default(""),
      })
    )
    .max(8)
    .optional()
    .default([]),
  allegaTracking: z.boolean(),
  allegaLettera: z.boolean(),
  allegaFile: z.boolean(),
  destinatarioEmail: z.string().trim().max(240).optional().default(""),
  oggetto: z.string().trim().max(240).optional().default(""),
  corpo: z.string().trim().max(20000).optional().default(""),
  accountId: z.string().uuid().nullable().optional(),
  modo: z.enum(["prenota", "compila", "salva"]),
});

export type SpedizioneMailUpsertInput = z.infer<typeof spedizioneMailUpsertSchema>;

export function mapSpedizioneMailRow(
  r: Record<string, unknown>
): SpedizioneMailPrenotazione {
  const rawAll = Array.isArray(r.allegati) ? r.allegati : [];
  const allegati: SpedizioneMailAllegato[] = rawAll
    .map((a) => {
      const o = a as Record<string, unknown>;
      return {
        path: String(o.path ?? "").trim(),
        name: String(o.name ?? "").trim(),
        contentType: String(o.contentType ?? o.content_type ?? "").trim(),
      };
    })
    .filter((a) => a.path && a.name);
  const stato = SPEDIZIONE_MAIL_STATI.includes(
    String(r.stato) as SpedizioneMailStato
  )
    ? (r.stato as SpedizioneMailStato)
    : "prenotata";
  return {
    id: String(r.id),
    entityType: r.entity_type === "ordine" ? "ordine" : "campionatura",
    entityId: String(r.entity_id),
    stato,
    documentoStato:
      r.documento_stato === "approvato" || r.documento_stato === "chiuso"
        ? r.documento_stato
        : "bozza",
    versione: Number(r.versione) || 1,
    trackingUrl: String(r.tracking_url ?? ""),
    letteraViaPath: String(r.lettera_via_path ?? ""),
    letteraViaName: String(r.lettera_via_name ?? ""),
    allegati,
    allegaTracking: Boolean(r.allega_tracking),
    allegaLettera: Boolean(r.allega_lettera),
    allegaFile: Boolean(r.allega_file),
    destinatarioEmail: String(r.destinatario_email ?? ""),
    oggetto: String(r.oggetto ?? ""),
    corpo: String(r.corpo ?? ""),
    accountId: r.account_id ? String(r.account_id) : null,
    prenotataAt: r.prenotata_at ? String(r.prenotata_at) : null,
    inviataAt: r.inviata_at ? String(r.inviata_at) : null,
  };
}

export function trackingMancante(
  allegaTracking: boolean,
  trackingUrl: string
): boolean {
  return allegaTracking && !trackingUrl.trim();
}
