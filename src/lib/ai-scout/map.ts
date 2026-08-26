import type { AiScoutLead, AiScoutStatus } from "@/lib/ai-scout/types";

export function mapAiScoutLead(row: Record<string, unknown>): AiScoutLead {
  return {
    id: String(row.id),
    companyName: String(row.company_name ?? ""),
    productCategory: String(row.product_category ?? ""),
    location: String(row.location ?? ""),
    email: String(row.email ?? ""),
    websiteOrSocial: String(row.website_or_social ?? ""),
    contextNotes: String(row.context_notes ?? ""),
    emailSubject: String(row.email_subject ?? ""),
    emailDraft: String(row.email_draft ?? ""),
    status: String(row.status ?? "DRAFT") as AiScoutStatus,
    scoutCategory: String(row.scout_category ?? ""),
    scoutRegion: String(row.scout_region ?? ""),
    documentoVersione: Number(row.documento_versione) || 1,
    webmailAccountId: (row.webmail_account_id as string | null) ?? null,
    approvedAt: (row.approved_at as string | null) ?? null,
    sentAt: (row.sent_at as string | null) ?? null,
    rejectedAt: (row.rejected_at as string | null) ?? null,
    groundingUsed: Boolean(row.grounding_used),
    geminiModel: String(row.gemini_model ?? ""),
    createdAt: String(row.created_at ?? ""),
    updatedAt: String(row.updated_at ?? ""),
  };
}
