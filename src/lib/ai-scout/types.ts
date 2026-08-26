import { z } from "zod";

export const AI_SCOUT_STATUSES = [
  "DRAFT",
  "APPROVED",
  "SENT",
  "REJECTED",
] as const;

export type AiScoutStatus = (typeof AI_SCOUT_STATUSES)[number];

export type AiScoutLead = {
  id: string;
  companyName: string;
  productCategory: string;
  location: string;
  email: string;
  websiteOrSocial: string;
  contextNotes: string;
  emailSubject: string;
  emailDraft: string;
  status: AiScoutStatus;
  scoutCategory: string;
  scoutRegion: string;
  documentoVersione: number;
  webmailAccountId: string | null;
  approvedAt: string | null;
  sentAt: string | null;
  rejectedAt: string | null;
  groundingUsed: boolean;
  geminiModel: string;
  createdAt: string;
  updatedAt: string;
};

export const scoutProducersSchema = z.object({
  category: z
    .string()
    .trim()
    .min(2, "Categoria obbligatoria")
    .max(120),
  region: z.string().trim().min(2, "Regione obbligatoria").max(120),
  maxResults: z.number().int().min(1).max(15).optional().default(8),
});

export const generateDraftsSchema = z.object({
  leadIds: z.array(z.string().uuid()).max(50).optional(),
  onlyMissing: z.boolean().optional().default(true),
});

export const sendLeadEmailSchema = z.object({
  leadId: z.string().uuid(),
  webmailAccountId: z.string().uuid().optional().nullable(),
  useSystemSmtp: z.boolean().optional().default(false),
});

export const updateLeadDraftSchema = z.object({
  leadId: z.string().uuid(),
  emailDraft: z.string().trim().min(10).max(8000),
  emailSubject: z.string().trim().min(3).max(200).optional(),
});

export const rejectLeadSchema = z.object({
  leadId: z.string().uuid(),
  reason: z.string().trim().max(500).optional().default(""),
});

export const geminiProducerSchema = z.object({
  company_name: z.string().min(1).max(300),
  product_category: z.string().max(200).optional().default(""),
  location: z.string().max(200).optional().default(""),
  email: z.string().max(200).optional().default(""),
  website_or_social: z.string().max(500).optional().default(""),
  context_notes: z.string().max(2000).optional().default(""),
});

export const geminiProducersResponseSchema = z.object({
  producers: z.array(geminiProducerSchema).max(20),
});
