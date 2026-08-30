import { z } from "zod";
import type {
  WikiIngestStatus,
  WikiPaperCategory,
  WikiResearchStatus,
  WikiScientificResearchRow,
} from "@/types/database";

export const WIKI_PAPER_CATEGORIES = [
  "Agronomia",
  "Nutrizione",
  "Cosmetica",
  "Usi Industriali",
] as const;

export const WIKI_PLANT_PARTS = ["cladodes", "fruits", "flowers"] as const;
export const WIKI_SECTORS = [
  "most_searched",
  "pharma",
  "nutrace",
  "food",
  "cosmetic",
  "veterina",
  "technical",
  "other",
] as const;

export const wikiResearchStatusSchema = z.enum([
  "draft",
  "published",
  "archived",
]);

export const createWikiResearchSchema = z.object({
  title: z.string().trim().min(1, "Titolo obbligatorio").max(500),
  abstract: z.string().trim().max(20000).optional().default(""),
  slug: z
    .string()
    .trim()
    .min(2, "Slug obbligatorio")
    .max(180)
    .regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/, "Slug: solo minuscole, numeri e -"),
  publishedYear: z.number().int().min(1900).max(2100),
  publishedMonth: z.number().int().min(1).max(12),
  plantParts: z.array(z.enum(WIKI_PLANT_PARTS)).default([]),
  sectors: z.array(z.enum(WIKI_SECTORS)).default([]),
  isMostSearched: z.boolean().optional().default(false),
  isEvidence: z.boolean().optional().default(false),
  externalLink: z.string().trim().max(2000).optional().default(""),
  authors: z.array(z.string().trim().min(1)).max(40).optional().default([]),
  keywords: z.array(z.string().trim().min(1)).max(40).optional().default([]),
  category: z
    .enum(["", "Agronomia", "Nutrizione", "Cosmetica", "Usi Industriali"])
    .optional()
    .default(""),
  aiSummary: z.string().trim().max(8000).optional().default(""),
  publicUrl: z.string().trim().max(2000).optional().default(""),
  storagePath: z.string().trim().max(500).optional().default(""),
});

export type CreateWikiResearchInput = z.infer<typeof createWikiResearchSchema>;

export type WikiResearch = {
  id: string;
  title: string;
  abstract: string;
  slug: string;
  plantParts: string[];
  sectors: string[];
  isMostSearched: boolean;
  isEvidence: boolean;
  publishedYear: number;
  publishedMonth: number;
  publishedAt: string;
  externalLink: string;
  pdfAvailable: boolean;
  publicUrl: string;
  authors: string[];
  keywords: string[];
  category: WikiPaperCategory;
  aiSummary: string;
  status: WikiResearchStatus;
  ingestStatus: WikiIngestStatus;
  ingestError: string;
  versione: number;
  chunkCount?: number;
  createdAt: string;
  updatedAt: string;
};

export function slugFromTitle(title: string): string {
  return title
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 180);
}

export function mapWikiResearch(
  row: WikiScientificResearchRow,
  chunkCount?: number
): WikiResearch {
  return {
    id: row.id,
    title: row.title,
    abstract: row.abstract,
    slug: row.slug,
    plantParts: row.plant_parts ?? [],
    sectors: row.sectors ?? [],
    isMostSearched: Boolean(row.is_most_searched),
    isEvidence: Boolean(row.is_evidence),
    publishedYear: row.published_year,
    publishedMonth: row.published_month,
    publishedAt: row.published_at,
    externalLink: row.external_link ?? "",
    pdfAvailable: Boolean(row.pdf_available),
    publicUrl: row.public_url ?? "",
    authors: row.authors ?? [],
    keywords: row.keywords ?? [],
    category: (row.category as WikiPaperCategory) ?? "",
    aiSummary: row.ai_summary ?? "",
    status: row.status,
    ingestStatus: row.ingest_status,
    ingestError: row.ingest_error ?? "",
    versione: row.versione ?? 1,
    chunkCount,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}
