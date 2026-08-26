import { z } from "zod";

export const INVOICE_AI_VERIFICATION_STATUSES = [
  "AUTO_MATCHED",
  "NEEDS_REVIEW",
  "VERIFIED",
] as const;

export type InvoiceAiVerificationStatus =
  (typeof INVOICE_AI_VERIFICATION_STATUSES)[number];

export const invoiceAiMatchLineInputSchema = z.object({
  key: z.string().min(1).max(64),
  descrizione: z.string().max(2000),
  quantita: z.number().finite().optional(),
  prezzoUnitario: z.number().finite().optional(),
  codiceFornitore: z.string().max(120).optional().default(""),
  /** Codice già presente sulla riga (se valorizzato). */
  codiceAttuale: z.string().max(120).optional().default(""),
});

export const invoiceAiMatchRequestSchema = z.object({
  fornitoreId: z.string().uuid().nullable().optional(),
  fatturaId: z.string().uuid().nullable().optional(),
  lines: z.array(invoiceAiMatchLineInputSchema).min(1).max(80),
  /** Se true, salta Gemini e usa solo affinità locale + SKU. */
  localOnly: z.boolean().optional().default(false),
});

export const invoiceAiMatchResultSchema = z.object({
  key: z.string(),
  matched_product_id: z.string().nullable(),
  matched_codice: z.string().nullable().optional(),
  matched_nome: z.string().nullable().optional(),
  matched_kind: z
    .enum(["servizio", "prodotto", "materia", "contributo"])
    .nullable()
    .optional(),
  confidence_score: z.number().min(0).max(100),
  suggested_internal_code: z.string().nullable(),
  ai_reasoning: z.string(),
  verification_status: z.enum(INVOICE_AI_VERIFICATION_STATUSES),
});

export type InvoiceAiMatchLineInput = z.infer<
  typeof invoiceAiMatchLineInputSchema
>;
export type InvoiceAiMatchResult = z.infer<typeof invoiceAiMatchResultSchema>;

/** Payload persistito in fatture_ricevute_righe.ai_match_data */
export type InvoiceAiMatchData = {
  confidence_score: number;
  suggested_internal_code: string | null;
  matched_product_id: string | null;
  matched_codice: string | null;
  matched_nome: string | null;
  matched_kind: string | null;
  ai_reasoning: string;
  model: string;
  source: "gemini" | "local" | "auto_exact";
  matched_at: string;
};

export function buildAiMatchData(
  result: InvoiceAiMatchResult,
  meta: { model: string; source: InvoiceAiMatchData["source"] }
): InvoiceAiMatchData {
  return {
    confidence_score: result.confidence_score,
    suggested_internal_code: result.suggested_internal_code,
    matched_product_id: result.matched_product_id,
    matched_codice: result.matched_codice ?? null,
    matched_nome: result.matched_nome ?? null,
    matched_kind: result.matched_kind ?? null,
    ai_reasoning: result.ai_reasoning,
    model: meta.model,
    source: meta.source,
    matched_at: new Date().toISOString(),
  };
}
